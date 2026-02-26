"""
Bulk Import Service with Transaction Support

Handles student bulk import with:
- All-or-nothing transaction-based imports
- Proper class validation and creation with normalized fields
- Memory-safe ZIP image processing
- Clear user-friendly error messages
"""

import os
import re
import tempfile
import shutil
import zipfile
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

from app.database import get_db
from app.services.image_service import ImageService
from app.services.excel_service import execute_import_transaction
from app.services.face_enrollment_service import FaceEnrollmentService
from app.utils.student_id_utils import generate_imported_student_id

logger = logging.getLogger(__name__)

# Constants
MAX_ZIP_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


# ---------------------------------------------------------------------------
# Normalization Helpers
# ---------------------------------------------------------------------------

def _normalize_string(s: str) -> str:
    """Normalize string: trim, collapse spaces, replace non-breaking spaces."""
    if not s:
        return ""
    return re.sub(r'\s+', ' ', (s or '').replace('\u00A0', ' ').replace('\t', ' ')).strip()


def _normalize_key(s: str) -> str:
    """Normalize for index keys: trim, collapse spaces, lowercase."""
    return _normalize_string(s).lower()


# ---------------------------------------------------------------------------
# ZIP Validation & Extraction
# ---------------------------------------------------------------------------

def validate_zip_file_path(zip_path: str) -> Tuple[bool, str]:
    """
    Validate ZIP file size and integrity.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        size = os.path.getsize(zip_path)
        if size > MAX_ZIP_SIZE:
            size_mb = size / (1024 * 1024)
            logger.error(f"[BULK] ZIP too large: {size_mb:.1f}MB")
            return False, f"ZIP file too large ({size_mb:.1f}MB). Maximum allowed: 50MB"

        with zipfile.ZipFile(zip_path, 'r') as zf:
            bad_file = zf.testzip()
            if bad_file:
                logger.error(f"[BULK] Corrupted file in ZIP: {bad_file}")
                return False, f"ZIP contains corrupted file: {bad_file}"
    except zipfile.BadZipFile:
        logger.error("[BULK] Invalid ZIP file")
        return False, "Invalid or corrupted ZIP file"
    except Exception as e:
        logger.error(f"[BULK] ZIP validation error: {str(e)}")
        return False, f"ZIP validation failed: {str(e)}"
    
    return True, ""


def extract_zip_streaming_from_path(zip_path: str, extract_dir: str) -> Dict[str, str]:
    """
    Extract ZIP to temp directory using streaming.
    
    Returns:
        Dict mapping lowercase filename to full path
    """
    image_map = {}
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for file_info in zf.infolist():
            if file_info.is_dir():
                continue
            
            filename = file_info.filename
            if filename.startswith('.') or '/__MACOSX' in filename:
                continue
            
            base_filename = os.path.basename(filename)
            if not base_filename:
                continue
            
            ext = os.path.splitext(base_filename)[1].lower()
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                continue
            
            extract_path = os.path.join(extract_dir, base_filename)
            
            with zf.open(file_info) as source, open(extract_path, 'wb') as target:
                shutil.copyfileobj(source, target)
            
            image_map[base_filename.lower()] = extract_path
    
    logger.info(f"[BULK] Extracted {len(image_map)} images")
    return image_map


# ---------------------------------------------------------------------------
# Class Validation & Creation
# ---------------------------------------------------------------------------

def validate_and_prepare_classes(
    valid_rows: List[Dict],
    school_id: str,
    db
) -> Tuple[List[Dict], List[Dict]]:
    """
    Extract and validate all unique classes from rows BEFORE any DB operations.
    
    Returns:
        Tuple of (classes_to_create, errors)
    """
    errors = []
    classes_to_create = []
    seen_class_keys = set()
    
    for row in valid_rows:
        class_name = _normalize_string(row.get("class_id", ""))
        section = _normalize_string(row.get("section", ""))
        row_num = row.get("row_num", 0)
        student_name = row.get("full_name", "Unknown")
        
        # Validate class_name is not empty
        if not class_name:
            errors.append({
                "row": row_num,
                "column": "Class",
                "value": "",
                "reason": f"Class name is missing for student \"{student_name}\"."
            })
            continue
        
        class_norm = _normalize_key(class_name)
        section_norm = _normalize_key(section) if section else ""
        
        # Create unique key for this class/section combo
        class_key = f"{class_norm}|{section_norm}"
        
        if class_key in seen_class_keys:
            continue
        seen_class_keys.add(class_key)
        
        # Check if class already exists in DB
        query = {
            "school_id": school_id,
            "class_name_norm": class_norm,
        }
        if section_norm:
            query["section_norm"] = section_norm
        else:
            # Match empty or missing section_norm
            query["$or"] = [
                {"section_norm": ""},
                {"section_norm": {"$exists": False}},
                {"section_norm": None}
            ]
            del query["school_id"]  # Re-add with $and
            query = {
                "$and": [
                    {"school_id": school_id},
                    {"class_name_norm": class_norm},
                    {"$or": [
                        {"section_norm": ""},
                        {"section_norm": {"$exists": False}},
                        {"section_norm": None}
                    ]}
                ]
            }
        
        existing = db.classes.find_one(query)
        
        if not existing:
            classes_to_create.append({
                "class_name": class_name,
                "class_name_norm": class_norm,
                "section": section,
                "section_norm": section_norm,
                "school_id": school_id,
                "assigned_subjects": [],
                "assigned_teachers": [],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            })
    
    return classes_to_create, errors


def get_or_create_class_id(
    class_name: str,
    section: str,
    school_id: str,
    db,
    created_classes_cache: Dict[str, str]
) -> Optional[str]:
    """
    Get existing class ID or return the ID of a newly created class from cache.
    """
    class_norm = _normalize_key(class_name)
    section_norm = _normalize_key(section) if section else ""
    cache_key = f"{class_norm}|{section_norm}"
    
    # Check cache first (for classes created in this transaction)
    if cache_key in created_classes_cache:
        return created_classes_cache[cache_key]
    
    # Look up in DB
    query = {
        "school_id": school_id,
        "class_name_norm": class_norm,
    }
    if section_norm:
        query["section_norm"] = section_norm
    
    existing = db.classes.find_one(query)
    if existing:
        class_id = str(existing.get("_id"))
        created_classes_cache[cache_key] = class_id
        return class_id
    
    return None


# ---------------------------------------------------------------------------
# Transaction-based Import (All or Nothing)
# ---------------------------------------------------------------------------

def execute_import_with_images(
    rows_to_insert: List[Dict],
    rows_to_update: List[Dict],
    duplicate_action: str,
    db,
    school_id: str,
    zip_path: Optional[str] = None
) -> Tuple[int, int, List[Dict]]:
    """
    Execute import with TRANSACTION support - ALL OR NOTHING.
    
    If ANY student fails:
    - Rollback all students
    - Rollback all auto-created classes
    - Clean up images
    - Return failed status
    
    Returns:
        Tuple of (success_count, fail_count, user_friendly_errors)
    """
    errors: List[Dict] = []
    temp_dir = None
    image_map = {}
    
    # Track what we create for rollback
    created_class_ids: List[str] = []
    created_student_ids: List[str] = []
    created_classes_cache: Dict[str, str] = {}
    
    try:
        # --- STAGE 1: Pre-validation ---
        logger.info(f"[BULK] Stage 1: Validating {len(rows_to_insert)} rows")
        
        # Generate student IDs for all rows
        for row in rows_to_insert:
            reg_number = row.get("registration_number", "")
            row["student_id"] = generate_imported_student_id(reg_number)
            row["admission_year"] = 0
        
        # Validate all classes upfront
        classes_to_create, class_errors = validate_and_prepare_classes(
            rows_to_insert, school_id, db
        )
        
        if class_errors:
            # If any class validation fails, abort entire import
            logger.error(f"[BULK] Class validation failed: {len(class_errors)} errors")
            return 0, len(rows_to_insert), class_errors
        
        # --- STAGE 2: Extract images if ZIP provided ---
        if zip_path:
            logger.info("[BULK] Stage 2: Extracting images")
            temp_dir = tempfile.mkdtemp(prefix="student_import_")
            image_map = extract_zip_streaming_from_path(zip_path, temp_dir)
        
        # --- STAGE 3: Create classes (part of transaction) ---
        logger.info(f"[BULK] Stage 3: Creating {len(classes_to_create)} new classes")
        
        for class_doc in classes_to_create:
            try:
                result = db.classes.insert_one(class_doc)
                class_id = str(result.inserted_id)
                created_class_ids.append(class_id)
                
                # Cache for student creation
                cache_key = f"{class_doc['class_name_norm']}|{class_doc['section_norm']}"
                created_classes_cache[cache_key] = class_id
                
                logger.info(f"[BULK] Created class: {class_doc['class_name']}/{class_doc['section']}")
            except Exception as e:
                error_msg = str(e)
                # Handle duplicate key error gracefully
                if "E11000" in error_msg or "duplicate key" in error_msg.lower():
                    logger.warning(f"[BULK] Class already exists: {class_doc['class_name']}/{class_doc['section']}")
                    # Try to find existing class
                    existing = db.classes.find_one({
                        "school_id": school_id,
                        "class_name_norm": class_doc['class_name_norm'],
                        "section_norm": class_doc['section_norm']
                    })
                    if existing:
                        cache_key = f"{class_doc['class_name_norm']}|{class_doc['section_norm']}"
                        created_classes_cache[cache_key] = str(existing["_id"])
                        continue
                
                # Rollback created classes
                logger.error(f"[BULK] Class creation failed, rolling back: {error_msg}")
                _rollback_classes(db, created_class_ids)
                return 0, len(rows_to_insert), [{
                    "row": 0,
                    "column": "Class",
                    "value": class_doc['class_name'],
                    "reason": f"Failed to create class \"{class_doc['class_name']}\". Import cancelled."
                }]
        
        # --- STAGE 4: Create students using TRANSACTION ---
        logger.info(f"[BULK] Stage 4: Creating {len(rows_to_insert)} students with transaction")
        
        # Add school_id and process images for all rows
        for row in rows_to_insert:
            row["school_id"] = school_id
            
            # Process image if available
            image_blob, image_type = _process_student_image(
                row, image_map, row.get("full_name", "Unknown")
            )
            
            if image_blob:
                row["profile_image_blob"] = image_blob
                row["profile_image_type"] = image_type
                row["image_uploaded_at"] = datetime.utcnow()
                row["embedding_status"] = "pending"
        
        # Use transaction-based import
        success_count, fail_count, errors = execute_import_transaction(
            rows_to_insert, rows_to_update, duplicate_action, db
        )
        
        if fail_count > 0:
            # Transaction failed - rollback classes we created
            logger.error(f"[BULK] Transaction failed, rolling back {len(created_class_ids)} classes")
            _rollback_classes(db, created_class_ids)
            return 0, len(rows_to_insert) + len(rows_to_update), errors
        
        # Track created student IDs for face enrollment
        created_student_ids = []
        if success_count > 0:
            # Find the inserted students to get their IDs
            for row in rows_to_insert:
                student_id = generate_imported_student_id(row.get("registration_number", ""))
                student_doc = db.students.find_one({"student_id": student_id, "school_id": school_id})
                if student_doc:
                    created_student_ids.append(str(student_doc["_id"]))
        
        # --- STAGE 5: Handle updates (already done in transaction) ---
        update_count = len(rows_to_update) if duplicate_action == "update" else 0
        
        # SUCCESS!
        total_success = len(created_student_ids) + update_count
        logger.info(f"[BULK] Import completed: {len(created_student_ids)} created, {update_count} updated")
        
        # Trigger face enrollment for students with images (non-blocking)
        _trigger_bulk_face_enrollment(db, created_student_ids, school_id)
        
        return total_success, 0, []
        
    except Exception as e:
        logger.exception(f"[BULK] Unexpected error during import: {str(e)}")
        
        # Rollback everything on unexpected error
        _rollback_students(db, created_student_ids)
        _rollback_classes(db, created_class_ids)
        
        return 0, len(rows_to_insert), [{
            "row": 0,
            "column": "System",
            "value": "-",
            "reason": "An unexpected error occurred during import. No data was saved."
        }]
        
    finally:
        # Clean up temp directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info("[BULK] Cleaned up temp directory")
            except Exception as e:
                logger.warning(f"[BULK] Failed to clean temp directory: {str(e)}")


# ---------------------------------------------------------------------------
# Rollback Helpers
# ---------------------------------------------------------------------------

def _rollback_students(db, student_ids: List[str]):
    """Delete created students on rollback."""
    if not student_ids:
        return
    
    try:
        from bson import ObjectId
        object_ids = [ObjectId(sid) for sid in student_ids]
        result = db.students.delete_many({"_id": {"$in": object_ids}})
        logger.info(f"[BULK] Rolled back {result.deleted_count} students")
    except Exception as e:
        logger.error(f"[BULK] Rollback students failed: {str(e)}")


def _rollback_classes(db, class_ids: List[str]):
    """Delete auto-created classes on rollback."""
    if not class_ids:
        return
    
    try:
        from bson import ObjectId
        object_ids = [ObjectId(cid) for cid in class_ids]
        result = db.classes.delete_many({"_id": {"$in": object_ids}})
        logger.info(f"[BULK] Rolled back {result.deleted_count} classes")
    except Exception as e:
        logger.error(f"[BULK] Rollback classes failed: {str(e)}")


# ---------------------------------------------------------------------------
# Image Processing
# ---------------------------------------------------------------------------

def _process_student_image(
    row: Dict,
    image_map: Dict[str, str],
    student_name: str
) -> Tuple[Optional[str], Optional[str]]:
    """
    Process student image from ZIP if available.
    
    Returns:
        Tuple of (image_blob, image_type) or (None, None)
    """
    if not image_map:
        return None, None
    
    image_name = row.get("image_name", "")
    reg_number = row.get("registration_number", "")
    roll_number = row.get("roll_number", "")
    
    # Try multiple image name patterns
    possible_names = [
        image_name.lower() if image_name else None,
        f"{reg_number}.jpg".lower() if reg_number else None,
        f"{reg_number}.jpeg".lower() if reg_number else None,
        f"{reg_number}.png".lower() if reg_number else None,
        f"{roll_number}.jpg".lower() if roll_number else None,
        f"{roll_number}.jpeg".lower() if roll_number else None,
        f"{roll_number}.png".lower() if roll_number else None,
    ]
    
    image_path = None
    for name in possible_names:
        if name and name in image_map:
            image_path = image_map[name]
            break
    
    if not image_path or not os.path.exists(image_path):
        return None, None
    
    try:
        with open(image_path, 'rb') as f:
            image_content = f.read()
        
        image_blob, image_type, error = ImageService.process_and_store(
            image_content,
            max_dimension=800,
            quality=85
        )
        
        if image_blob:
            logger.info(f"[BULK] Processed image for: {student_name}")
            return image_blob, image_type
        else:
            logger.warning(f"[BULK] Image processing failed for {student_name}: {error}")
            
    except Exception as e:
        logger.warning(f"[BULK] Image read failed for {student_name}: {str(e)}")
    
    return None, None


# ---------------------------------------------------------------------------
# User-Friendly Error Messages
# ---------------------------------------------------------------------------

def _get_friendly_error_message(error_msg: str, student_name: str, row: Dict) -> str:
    """
    Convert technical error messages to user-friendly messages.
    """
    error_lower = error_msg.lower()
    
    if "e11000" in error_lower or "duplicate key" in error_lower:
        if "registration" in error_lower or "student_id" in error_lower:
            return f"Student \"{student_name}\" could not be imported because a student with this Registration Number already exists."
        if "class" in error_lower:
            return f"Student \"{student_name}\" could not be imported due to a class conflict."
        return f"Student \"{student_name}\" could not be imported because their data conflicts with an existing record."
    
    if "validation" in error_lower:
        return f"Student \"{student_name}\" has invalid data. Please check all fields are filled correctly."
    
    if "connection" in error_lower or "timeout" in error_lower:
        return "Import failed due to a connection issue. Please try again."
    
    # Generic fallback - do NOT expose technical details
    return f"Student \"{student_name}\" could not be imported. Please check the data and try again."


def _trigger_bulk_face_enrollment(db, student_ids: List[str], school_id: str):
    """
    Trigger face enrollment for all newly imported students with images.
    Runs asynchronously in background - does not block import process.
    """
    if not student_ids:
        return
    
    try:
        from bson import ObjectId
        
        # Find all students with images
        students_with_images = list(db.students.find({
            "_id": {"$in": [ObjectId(sid) for sid in student_ids]},
            "profile_image_blob": {"$exists": True, "$ne": None}
        }, {
            "_id": 1,
            "student_id": 1,
            "full_name": 1,
            "profile_image_blob": 1,
            "profile_image_type": 1
        }))
        
        if not students_with_images:
            logger.info("[BULK] No students with images to enroll")
            return
        
        logger.info(f"[BULK] Triggering face enrollment for {len(students_with_images)} students")
        
        # Process each student in background
        enrollment_service = FaceEnrollmentService()
        success_count = 0
        failed_count = 0
        
        for student in students_with_images:
            try:
                student_id = student.get("student_id")
                full_name = student.get("full_name", "Unknown")
                image_blob = student.get("profile_image_blob")
                image_type = student.get("profile_image_type", "image/jpeg")
                
                if not student_id or not image_blob:
                    continue
                
                # Enroll to external face recognition app
                enrollment_service.enroll_person(
                    person_id=student_id,
                    name=full_name,
                    role="student",
                    image_blob=image_blob,
                    image_type=image_type,
                    school_id=school_id  # Pass school_id for unique ID
                )
                
                # Generate internal embedding
                asyncio.create_task(
                    enrollment_service.generate_embedding_for_person(
                        person_id=student_id,
                        name=full_name,
                        role="student",
                        image_base64=image_blob,
                        image_type=image_type,
                        db=db
                    )
                )
                
                success_count += 1
                logger.info(f"[BULK] Face enrolled: {student_id} - {full_name}")
                
            except Exception as e:
                failed_count += 1
                logger.warning(f"[BULK] Face enrollment failed for {student.get('student_id')}: {str(e)}")
                # Continue with other students - don't fail the entire batch
        
        logger.info(f"[BULK] Face enrollment completed: {success_count} success, {failed_count} failed")
        
    except Exception as e:
        logger.exception(f"[BULK] Error during bulk face enrollment: {str(e)}")
        # Don't raise - this is background processing


# ---------------------------------------------------------------------------
# Legacy function for compatibility
# ---------------------------------------------------------------------------

def process_bulk_import_with_images(
    valid_rows: List[Dict],
    zip_path: Optional[str],
    school_id: str,
    db
) -> Tuple[int, int, List[Dict], int, int]:
    """
    Legacy wrapper - redirects to new transaction-based import.
    """
    success, fail, errors = execute_import_with_images(
        valid_rows,
        [],  # No updates in legacy mode
        "skip",
        db,
        school_id,
        zip_path
    )
    return success, fail, errors, 0, 0
