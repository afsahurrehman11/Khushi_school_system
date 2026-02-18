"""
Bulk Import Service with ZIP Image Support

Handles student bulk import with optional ZIP file containing student images.
Memory-safe: Uses streaming unzip and processes images one-by-one.
"""

import os
import tempfile
import shutil
import zipfile
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path

from app.database import get_db
from app.services.cloudinary_service import CloudinaryService
from app.services.excel_service import build_student_doc
from app.utils.student_id_utils import generate_imported_student_id

logger = logging.getLogger(__name__)

# Constants
MAX_ZIP_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


def validate_zip_file_path(zip_path: str) -> Tuple[bool, str]:
    """
    Validate ZIP file size and integrity.
    
    Args:
        zip_content: ZIP file bytes
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        size = os.path.getsize(zip_path)
        if size > MAX_ZIP_SIZE:
            size_mb = size / (1024 * 1024)
            logger.error(f"🔴 [BULK] ZIP too large: {size_mb:.1f}MB (max 50MB)")
            return False, f"ZIP file too large ({size_mb:.1f}MB). Maximum allowed: 50MB"

        # Try to open as ZIP to validate integrity
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Check for any corrupted files
            bad_file = zf.testzip()
            if bad_file:
                logger.error(f"🔴 [BULK] Corrupted file in ZIP: {bad_file}")
                return False, f"ZIP contains corrupted file: {bad_file}"
    except zipfile.BadZipFile:
        logger.error("🔴 [BULK] Invalid ZIP file")
        return False, "Invalid or corrupted ZIP file"
    except Exception as e:
        logger.error(f"🔴 [BULK] ZIP validation error: {str(e)}")
        return False, f"ZIP validation failed: {str(e)}"
    
    return True, ""


def extract_zip_streaming_from_path(zip_path: str, extract_dir: str) -> Dict[str, str]:
    """
    Extract ZIP to temp directory using streaming to avoid memory overload.
    
    Args:
        zip_content: ZIP file bytes
        extract_dir: Directory to extract to
        
    Returns:
        Dict mapping lowercase filename to full path
    """
    image_map = {}
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for file_info in zf.infolist():
            # Skip directories
            if file_info.is_dir():
                continue
            
            # Skip hidden files
            filename = file_info.filename
            if filename.startswith('.') or '/__MACOSX' in filename:
                continue
            
            # Get just the filename without path
            base_filename = os.path.basename(filename)
            if not base_filename:
                continue
            
            # Check if valid image extension
            ext = os.path.splitext(base_filename)[1].lower()
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                continue
            
            # Extract file
            extract_path = os.path.join(extract_dir, base_filename)
            
            # Stream extract to avoid memory issues
            with zf.open(file_info) as source, open(extract_path, 'wb') as target:
                shutil.copyfileobj(source, target)
            
            # Map lowercase name to path
            image_map[base_filename.lower()] = extract_path
            logger.debug(f"🔵 [BULK] Extracted: {base_filename}")
    
    logger.info(f"🟢 [BULK] Extracted {len(image_map)} images")
    return image_map


def process_bulk_import_with_images(
    valid_rows: List[Dict],
    zip_path: Optional[str],
    school_id: str,
    db
) -> Tuple[int, int, List[Dict], int, int]:
    """
    Process validated rows and import students with images.
    
    Args:
        valid_rows: List of validated student data rows
        zip_content: Optional ZIP file bytes containing images
        school_id: School ID for isolation
        db: Database instance
        
    Returns:
        Tuple of (success_count, fail_count, errors, images_uploaded, images_failed)
    """
    success_count = 0
    fail_count = 0
    errors: List[Dict] = []
    images_uploaded = 0
    images_failed = 0
    
    temp_dir = None
    image_map = {}
    
    try:
        # Extract ZIP if provided (path-based, streamed)
        if zip_path:
            logger.info("🔵 [BULK] Extracting ZIP file from path...")
            
            # Create temp directory
            temp_dir = tempfile.mkdtemp(prefix="student_import_")
            logger.info(f"🔵 [BULK] Temp directory: {temp_dir}")
            
            # Extract images
            image_map = extract_zip_streaming_from_path(zip_path, temp_dir)
        
        # Process each student row
        for row in valid_rows:
            row_num = row.get("row_num", 0)
            student_name = row.get("full_name", "Unknown")
            image_name = row.get("image_name", "")
            
            try:
                logger.info(f"🟢 [STUDENT] Creating: {student_name}")
                
                # Build student document
                doc = build_student_doc(row)
                doc["school_id"] = school_id
                
                # Check for image
                image_url = None
                image_public_id = None
                
                if image_name and image_map:
                    image_key = image_name.lower()
                    image_path = image_map.get(image_key)
                    
                    if image_path and os.path.exists(image_path):
                        logger.info(f"🔵 [UPLOAD] Uploading image: {image_name}")
                        
                        # Read image file
                        with open(image_path, 'rb') as f:
                            image_content = f.read()
                        
                        # Generate student_id for folder
                        student_id_for_path = doc.get("student_id", f"temp_{row_num}")
                        
                        # Upload to Cloudinary
                        upload_result = CloudinaryService.upload_image(
                            image_content,
                            image_name,
                            student_id_for_path,
                            school_id
                        )
                        
                        if upload_result:
                            image_url = upload_result["secure_url"]
                            image_public_id = upload_result["public_id"]
                            images_uploaded += 1
                            logger.info(f"🟢 [UPLOAD] Success: {image_name}")
                        else:
                            images_failed += 1
                            logger.error(f"🔴 [UPLOAD] Failed: {image_name}")
                            errors.append({
                                "row": row_num,
                                "column": "Image_Name",
                                "value": image_name,
                                "reason": "Image upload failed"
                            })
                    else:
                        images_failed += 1
                        logger.error(f"🔴 [UPLOAD] Image not found in ZIP: {image_name}")
                        errors.append({
                            "row": row_num,
                            "column": "Image_Name",
                            "value": image_name,
                            "reason": "Image not found in ZIP file"
                        })
                
                # Add image data to document if uploaded
                if image_url:
                    doc["profile_image_url"] = image_url
                    doc["profile_image_public_id"] = image_public_id
                    doc["image_uploaded_at"] = datetime.utcnow()
                    doc["embedding_status"] = "pending"
                
                # Insert student into database
                result = db.students.insert_one(doc)
                
                if result.inserted_id:
                    success_count += 1
                    logger.info(f"🟢 [STUDENT] Created: {doc.get('student_id')} - {student_name}")
                else:
                    fail_count += 1
                    logger.error(f"🔴 [STUDENT] Failed to create: {student_name}")
                    errors.append({
                        "row": row_num,
                        "column": "Student",
                        "value": student_name,
                        "reason": "Database insert failed"
                    })
                    
            except Exception as e:
                fail_count += 1
                logger.error(f"🔴 [STUDENT] Error creating {student_name}: {str(e)}")
                errors.append({
                    "row": row_num,
                    "column": "Student",
                    "value": student_name,
                    "reason": str(e)
                })
        
        logger.info(f"🟢 [BULK] Imported {success_count}/{len(valid_rows)} students")
        logger.info(f"🟢 [BULK] Images: {images_uploaded} uploaded, {images_failed} failed")
        
    finally:
        # Clean up temp directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"🟢 [BULK] Cleaned up temp directory")
            except Exception as e:
                logger.warning(f"⚠️ [BULK] Failed to clean temp directory: {str(e)}")
    
    return success_count, fail_count, errors, images_uploaded, images_failed


def execute_import_with_images(
    rows_to_insert: List[Dict],
    rows_to_update: List[Dict],
    duplicate_action: str,
    db,
    school_id: str,
    zip_path: Optional[str] = None
) -> Tuple[int, int, List[Dict]]:
    """
    Execute the import with optional image processing.
    Wraps process_bulk_import_with_images for the background import flow.
    
    Args:
        rows_to_insert: New student rows to insert
        rows_to_update: Existing student rows to update (if duplicate_action == 'update')
        duplicate_action: 'skip' or 'update'
        db: Database instance
        school_id: School ID for isolation
        zip_content: Optional ZIP file bytes
        
    Returns:
        Tuple of (success_count, fail_count, errors)
    """
    all_errors: List[Dict] = []
    total_success = 0
    total_fail = 0
    
    # Generate proper student_id for each row
    for row in rows_to_insert:
        excel_id = row.get("student_id", "")
        row["student_id"] = generate_imported_student_id(excel_id)
        row["admission_year"] = 0  # For imported students
    
    # Process new insertions
    if rows_to_insert:
        success, fail, errors, _, _ = process_bulk_import_with_images(
            rows_to_insert,
            zip_path,
            school_id,
            db
        )
        total_success += success
        total_fail += fail
        all_errors.extend(errors)
    
    # Handle updates if needed
    if duplicate_action == "update" and rows_to_update:
        from bson import ObjectId
        
        for row in rows_to_update:
            try:
                existing_id = row.get("_existing_id")
                if not existing_id:
                    continue
                
                doc = build_student_doc(row)
                doc.pop("created_at", None)
                doc["updated_at"] = datetime.utcnow()
                
                db.students.update_one(
                    {"_id": ObjectId(existing_id)},
                    {"$set": doc}
                )
                total_success += 1
                logger.info(f"🟢 [STUDENT] Updated: {row.get('full_name')}")
                
            except Exception as e:
                total_fail += 1
                all_errors.append({
                    "row": row.get("row_num", 0),
                    "column": "Student",
                    "value": row.get("full_name", "Unknown"),
                    "reason": f"Update failed: {str(e)}"
                })
    
    return total_success, total_fail, all_errors
