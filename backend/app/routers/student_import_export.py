"""
Student Import / Export Router — Admin-only.

Endpoints:
  GET   /students-import-export/sample-template        — download sample xlsx
  POST  /students-import-export/upload                  — upload & validate (returns preview)
  POST  /students-import-export/confirm/{log_id}        — confirm import (all-or-nothing)
  GET   /students-import-export/status/{log_id}         — poll import status
  GET   /students-import-export/export                  — export students xlsx
  GET   /students-import-export/history                 — import history list
  GET   /students-import-export/notifications/stream    — SSE stream for realtime notifications

NOTE: Error reporting is shown inline in the UI. No downloadable error report endpoint.
"""

import asyncio
import json
import logging
import tempfile
import shutil
import os
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse, Response

from app.dependencies.auth import check_permission, get_current_user
from app.database import get_db
from app.services.saas_db import get_school_database
from app.services.excel_service import (
    MAX_FILE_SIZE,
    generate_sample_template,
    parse_and_validate_rows,
    check_db_duplicates,
    execute_import_transaction,
    export_students_xlsx,
)
from app.services.import_log_service import (
    create_import_log,
    update_import_log,
    get_import_log,
    get_all_import_logs,
)
from app.services.student import get_all_students
from bson.objectid import ObjectId
from app.services.bulk_import_service import (
    validate_zip_file_path,
    execute_import_with_images,
    MAX_ZIP_SIZE,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ReportLab imports for PDF generation (print forms)
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from io import BytesIO

# ---------------------------------------------------------------------------
# In-memory notification bus (per-process; works for single-server deployments)
# ---------------------------------------------------------------------------
# Maps user_email → asyncio.Queue of notification dicts
_notification_queues: dict[str, list[asyncio.Queue]] = {}


def _publish_notification(user_email: str, payload: dict):
    """Push a notification to all SSE listeners for this user."""
    queues = _notification_queues.get(user_email, [])
    for q in queues:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


# ---------------------------------------------------------------------------
# Guard: Admin-only (NOT Root / Super)
# ---------------------------------------------------------------------------

async def require_school_admin(current_user: dict = Depends(get_current_user)) -> dict:
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    role = (current_user.get("role") or "").strip()
    
    if role != "Admin":
        logger.warning(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Unauthorized access attempt (role={role})")
        raise HTTPException(
            status_code=403,
            detail="Access denied. This feature is available only to School Admin users.",
        )
    return current_user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/sample-template")
async def download_sample_template(current_user: dict = Depends(require_school_admin)):
    """Download the sample Excel template."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Downloading sample template")
    
    try:
        xlsx_bytes = generate_sample_template()
        logger.info(f"[SCHOOL:{school_id}] ✅ Sample template downloaded")
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="students_import_template.xlsx"'},
        )
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to generate template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate template: {str(e)}")


@router.post("/upload")
async def upload_and_validate(
    file: UploadFile = File(...),
    images_zip: Optional[UploadFile] = File(None),
    duplicate_action: str = Form("skip"),
    current_user: dict = Depends(require_school_admin),
):
    """
    Upload an Excel file with optional ZIP file containing student images.
    
    IMPORTANT: This endpoint now returns immediately after accepting the upload.
    Validation happens in the background. Poll /status/{import_id} to check progress.
    
    ZIP file rules:
    - Maximum size: 50MB
    - Allowed image formats: jpg, jpeg, png
    - Image filenames must match the Image_Name column in Excel
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    database_name = current_user.get("database_name")
    logger.info(f"🔵 [BULK] Upload started by {admin_email}")
    logger.info(f"🔵 [BULK] Excel file: {file.filename}")
    
    try:
        # File type check for Excel
        allowed_types = {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        }
        if file.content_type not in allowed_types and not (file.filename or "").endswith((".xlsx", ".xls")):
            logger.error(f"🔴 [BULK] Invalid Excel file type: {file.content_type}")
            raise HTTPException(status_code=400, detail="Invalid file type. Only .xlsx / .xls files are accepted.")

        # Quick size check (before reading entire file)
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            logger.error(f"🔴 [BULK] Excel file too large: {len(content)} bytes")
            raise HTTPException(status_code=400, detail="Excel file exceeds maximum size of 10MB.")

        # Save Excel to temp file for background processing
        excel_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        excel_path = excel_tmp.name
        await asyncio.to_thread(lambda: excel_tmp.write(content))
        excel_tmp.close()
        logger.info(f"🟢 [BULK] Excel saved to temp: {excel_path}")

        # Process ZIP file if provided
        zip_path = None
        if images_zip and images_zip.filename:
            logger.info(f"🔵 [BULK] ZIP file: {images_zip.filename}")

            # Validate ZIP MIME type
            zip_allowed_types = {
                "application/zip",
                "application/x-zip-compressed",
                "application/x-zip",
            }
            if images_zip.content_type not in zip_allowed_types and not (images_zip.filename or "").endswith(".zip"):
                logger.error(f"🔴 [BULK] Invalid ZIP file type: {images_zip.content_type}")
                # Clean up Excel temp file
                try:
                    os.remove(excel_path)
                except Exception:
                    pass
                raise HTTPException(status_code=400, detail="Invalid ZIP file type. Only .zip files are accepted.")

            # Stream uploaded ZIP to a temporary file
            tmp_file = None
            try:
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
                tmp_file = tmp.name
                await asyncio.to_thread(shutil.copyfileobj, images_zip.file, tmp)
                tmp.close()

                # Quick ZIP validation (just size and integrity, detailed validation in background)
                is_valid, error_msg = validate_zip_file_path(tmp_file)
                if not is_valid:
                    try:
                        os.remove(tmp_file)
                        os.remove(excel_path)
                    except Exception:
                        pass
                    logger.error(f"🔴 [BULK] ZIP validation failed: {error_msg}")
                    raise HTTPException(status_code=400, detail=error_msg)

                size = os.path.getsize(tmp_file)
                logger.info(f"🟢 [BULK] ZIP validated: {size / (1024*1024):.1f}MB")
                zip_path = tmp_file
            except HTTPException:
                raise
            except Exception as e:
                # Cleanup on unexpected error
                if tmp_file and os.path.exists(tmp_file):
                    try:
                        os.remove(tmp_file)
                    except Exception:
                        pass
                try:
                    os.remove(excel_path)
                except Exception:
                    pass
                logger.exception(f"🔴 [BULK] Failed to store/validate ZIP: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Failed to process ZIP file: {str(e)}")

        # Create import log in "validating" state (validation happens in background)
        log_entry = create_import_log({
            "school_id": school_id,
            "file_name": file.filename or "unknown.xlsx",
            "zip_file_name": images_zip.filename if images_zip else None,
            "imported_by": admin_email,
            "imported_by_name": current_user.get("name", ""),
            "total_rows": 0,  # Will be updated after validation
            "successful_rows": 0,
            "failed_rows": 0,
            "duplicate_count": 0,
            "status": "validating",  # New status: validating → pending → processing → completed
            "errors": [],
            "duplicate_action": duplicate_action,
            "has_zip": zip_path is not None,
            "_excel_path": excel_path,  # Store temp Excel path
            "_zip_path": zip_path,  # Store temp ZIP path
        })

        import_id = log_entry["id"]
        logger.info(f"🟢 [BULK] Import {import_id} created, starting background validation")

        # Launch background validation task
        asyncio.get_event_loop().create_task(
            _run_validation_background(
                import_id, 
                admin_email, 
                school_id, 
                database_name, 
                excel_path, 
                zip_path,
                duplicate_action
            )
        )

        # Return immediately - frontend will poll for status
        return {
            "import_id": import_id,
            "file_name": file.filename,
            "zip_file_name": images_zip.filename if images_zip else None,
            "status": "validating",
            "message": "File uploaded successfully. Validation in progress. Poll /status/{import_id} to check progress.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴 [BULK] Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


async def _run_validation_background(
    import_id: str, 
    user_email: str, 
    school_id: str, 
    database_name: str,
    excel_path: str, 
    zip_path: Optional[str],
    duplicate_action: str
):
    """Background coroutine that validates the Excel file without blocking the HTTP response."""
    logger.info(f"🔵 [BULK] Starting background validation for {import_id}")
    try:
        # Read Excel file from temp storage
        with open(excel_path, 'rb') as f:
            content = f.read()

        # Parse & validate Excel (the slow operation)
        try:
            result = await asyncio.to_thread(parse_and_validate_rows, content)
        except Exception as e:
            logger.exception(f"🔴 [BULK] Parse error: {str(e)}")
            update_import_log(import_id, {
                "status": "failed",
                "errors": [{"row": 0, "column": "-", "value": "-", "reason": f"Failed to parse Excel file: {str(e)}"}],
                "_excel_path": None,
                "_zip_path": None,
            })
            # Cleanup temp files
            _cleanup_temp_files(excel_path, zip_path)
            _publish_notification(user_email, {
                "type": "import_validation_failed",
                "import_id": import_id,
                "message": f"Failed to parse Excel file: {str(e)}",
                "timestamp": datetime.utcnow().isoformat(),
            })
            return

        # Check DB duplicates for valid rows (another slow operation)
        db = get_school_database(database_name)
        try:
            clean_rows, db_dup_rows, updatable_rows = await asyncio.to_thread(
                check_db_duplicates, 
                result["valid_rows"], 
                db, 
                school_id=school_id
            )
        except Exception as e:
            logger.exception(f"🔴 [BULK] Duplicate check error: {str(e)}")
            update_import_log(import_id, {
                "status": "failed",
                "errors": [{"row": 0, "column": "-", "value": "-", "reason": f"Database error: {str(e)}"}],
                "_excel_path": None,
                "_zip_path": None,
            })
            _cleanup_temp_files(excel_path, zip_path)
            _publish_notification(user_email, {
                "type": "import_validation_failed",
                "import_id": import_id,
                "message": f"Database error: {str(e)}",
                "timestamp": datetime.utcnow().isoformat(),
            })
            return

        all_errors = result["error_rows"] + result["duplicate_rows"] + db_dup_rows
        all_duplicate_count = len(result["duplicate_rows"]) + len(db_dup_rows)

        # Update import log to "pending" state (validation complete, ready for confirmation)
        update_import_log(import_id, {
            "status": "pending",
            "total_rows": result["total_rows"],
            "failed_rows": len(result["error_rows"]),
            "duplicate_count": all_duplicate_count,
            "errors": all_errors,
            # Stash validated rows for the confirm step
            "_clean_rows": clean_rows,
            "_updatable_rows": updatable_rows,
            # Keep the temp file paths for confirm step
            "_excel_path": excel_path,
            "_zip_path": zip_path,
        })

        logger.info(f"🟢 [BULK] Validation complete for {import_id}: {len(clean_rows)} valid, {all_duplicate_count} duplicates")

        # Publish notification to frontend
        _publish_notification(user_email, {
            "type": "import_validation_complete",
            "import_id": import_id,
            "total_rows": result["total_rows"],
            "valid_rows": len(clean_rows) + (len(updatable_rows) if duplicate_action == "update" else 0),
            "error_rows": len(result["error_rows"]),
            "duplicate_rows": all_duplicate_count,
            "preview_data": [
                {k: v for k, v in r.items() if not k.startswith("_")}
                for r in clean_rows[:20]
            ],
            "message": f"Validation complete: {len(clean_rows)} students ready to import",
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Cleanup Excel temp file (keep zip for confirm step)
        try:
            if excel_path and os.path.exists(excel_path):
                os.remove(excel_path)
                logger.info(f"🟢 [BULK] Removed temp Excel: {excel_path}")
        except Exception as e:
            logger.warning(f"⚠️ [BULK] Failed to remove temp Excel: {e}")

    except Exception:
        logger.exception(f"🔴 [BULK] Background validation failed for {import_id}")
        update_import_log(import_id, {
            "status": "failed",
            "errors": [{"row": 0, "column": "-", "value": "-", "reason": "Internal server error during validation"}],
            "_excel_path": None,
            "_zip_path": None,
        })
        _cleanup_temp_files(excel_path, zip_path)
        _publish_notification(user_email, {
            "type": "import_validation_failed",
            "import_id": import_id,
            "message": "Internal server error during validation",
            "timestamp": datetime.utcnow().isoformat(),
        })


def _cleanup_temp_files(excel_path: Optional[str], zip_path: Optional[str]):
    """Helper to cleanup temporary files."""
    for path in [excel_path, zip_path]:
        if path and os.path.exists(path):
            try:
                os.remove(path)
                logger.info(f"🟢 [BULK] Removed temp file: {path}")
            except Exception as e:
                logger.warning(f"⚠️ [BULK] Failed to remove temp file {path}: {e}")


@router.post("/confirm/{import_id}")
async def confirm_import(
    import_id: str,
    current_user: dict = Depends(require_school_admin),
):
    """
    Confirm and execute the import after preview.
    Launches background processing and returns immediately.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Confirming import {import_id}")
    
    try:
        log = get_import_log(import_id)
        if not log:
            logger.error(f"[SCHOOL:{school_id}] ❌ Import log not found: {import_id}")
            raise HTTPException(status_code=404, detail="Import log not found")
        
        # Verify school_id matches (security check)
        if log.get("school_id") != school_id:
            logger.error(f"[SCHOOL:{school_id}] ❌ School mismatch for import {import_id}")
            raise HTTPException(status_code=403, detail="Access denied")

        if log.get("status") not in ("pending",):
            logger.error(f"[SCHOOL:{school_id}] ❌ Import already {log.get('status')}: {import_id}")
            raise HTTPException(status_code=400, detail=f"Import is already {log.get('status')}. Cannot re-confirm.")

        # Mark as processing
        update_import_log(import_id, {"status": "processing"})

        # Launch background task
        asyncio.get_event_loop().create_task(
            _run_import_background(import_id, admin_email, school_id, current_user.get("database_name"))
        )

        logger.info(f"[SCHOOL:{school_id}] ✅ Import started in background")
        return {
            "message": "Import started. You will receive a notification when the process completes.",
            "import_id": import_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to confirm import: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to confirm import: {str(e)}")


async def _run_import_background(import_id: str, user_email: str, school_id: str, database_name: str):
    """Background coroutine that performs the actual database writes with image processing."""
    logger.info(f"🔵 [BULK] Starting background import for {import_id}")
    try:
        log = get_import_log(import_id)
        if not log:
            logger.error(f"🔴 [BULK] Import log not found: {import_id}")
            return

        clean_rows = log.get("_clean_rows", [])
        updatable_rows = log.get("_updatable_rows", [])
        duplicate_action = log.get("duplicate_action", "skip")
        zip_path = log.get("_zip_path")
        excel_path = log.get("_excel_path")  # Also cleanup Excel if it exists

        db = get_school_database(database_name)

        rows_to_update = updatable_rows if duplicate_action == "update" else []

        # Use new import function that handles images
        success, fail, exec_errors = await asyncio.to_thread(
            execute_import_with_images,
            clean_rows,
            rows_to_update,
            duplicate_action,
            db,
            school_id,
            zip_path,
        )

        all_errors = log.get("errors", []) + exec_errors
        total_attempted = len(clean_rows) + len(rows_to_update)

        status = "completed"
        if fail > 0 or exec_errors:
            status = "completed_with_errors" if success > 0 else "failed"

        # After processing, remove temp files (both Excel and ZIP)
        _cleanup_temp_files(excel_path, zip_path)

        update_import_log(import_id, {
            "status": status,
            "successful_rows": success,
            "failed_rows": fail + log.get("failed_rows", 0),
            "errors": all_errors,
            # Remove temp stashed data
            "_clean_rows": [],
            "_updatable_rows": [],
            "_zip_path": None,
            "_excel_path": None,
        })

        logger.info(f"🟢 [BULK] Completed: {success} successful, {fail + log.get('failed_rows', 0)} failed")
        
        # Trigger embedding generation for newly imported students with images
        try:
            logger.info(f"🔵 [EMBEDDING] Triggering embedding generation for imported students")
            from app.services.embedding_service import EmbeddingGenerator
            
            # Get newly created students with pending embeddings
            newly_imported = db.students.find({
                "school_id": school_id,
                "embedding_status": "pending",
                "profile_image_url": {"$exists": True, "$ne": None}
            })
            
            embedding_count = 0
            for student in newly_imported:
                try:
                    embedding, status = EmbeddingGenerator.generate_embedding_from_url(
                        student.get("profile_image_url"),
                        student.get("student_id")
                    )
                    if embedding and status == "generated":
                        db.students.update_one(
                            {"_id": student["_id"]},
                            {
                                "$set": {
                                    "face_embedding": embedding,
                                    "embedding_status": "generated",
                                    "embedding_generated_at": datetime.utcnow(),
                                    "embedding_model": "VGGFace",
                                    "embedding_version": "1.0",
                                }
                            }
                        )
                        embedding_count += 1
                        logger.info(f"🟢 [EMBEDDING] Generated for {student.get('student_id')}")
                    else:
                        db.students.update_one(
                            {"_id": student["_id"]},
                            {"$set": {"embedding_status": "failed"}}
                        )
                except Exception as e:
                    logger.warning(f"⚠️ [EMBEDDING] Failed for {student.get('student_id')}: {str(e)}")
                    db.students.update_one(
                        {"_id": student["_id"]},
                        {"$set": {"embedding_status": "failed"}}
                    )
            
            logger.info(f"🟢 [EMBEDDING] Generated embeddings for {embedding_count} students")
        except Exception as e:
            logger.warning(f"⚠️ [EMBEDDING] Embedding generation failed: {str(e)}")
        
        # Publish notification
        notification = {
            "type": "import_complete",
            "import_id": import_id,
            "status": status,
            "successful_rows": success,
            "failed_rows": fail + log.get("failed_rows", 0),
            "file_name": log.get("file_name", ""),
            "message": (
                f"✅ Import completed successfully! {success} students imported. {fail + log.get('failed_rows', 0)} failed."
                if status == "completed"
                else f"⚠️ Import finished with errors. {success} succeeded, {fail + log.get('failed_rows', 0)} failed."
            ),
            "timestamp": datetime.utcnow().isoformat(),
            "should_refresh": True,  # Signal frontend to refresh student list
        }
        _publish_notification(user_email, notification)
        
        logger.info(f"🟢 [BULK] Published completion notification to {user_email}")

    except Exception:
        logger.exception(f"🔴 [BULK] Background import failed for {import_id}")
        update_import_log(import_id, {
            "status": "failed",
            "errors": [{"row": 0, "column": "-", "value": "-", "reason": "Internal server error during import"}],
            "_clean_rows": [],
            "_updatable_rows": [],
            "_zip_path": None,
        })
        _publish_notification(user_email, {
            "type": "import_complete",
            "import_id": import_id,
            "status": "failed",
            "message": "Import failed due to an internal error.",
            "timestamp": datetime.utcnow().isoformat(),
        })


@router.get("/status/{import_id}")
async def get_import_status(
    import_id: str,
    current_user: dict = Depends(require_school_admin),
):
    """
    Poll import status. 
    Status lifecycle: validating → pending → processing → completed/failed
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Checking import status {import_id}")
    
    try:
        log = get_import_log(import_id)
        if not log:
            logger.error(f"[SCHOOL:{school_id}] ❌ Import log not found: {import_id}")
            raise HTTPException(status_code=404, detail="Import log not found")
        
        # Verify school_id matches
        if log.get("school_id") != school_id:
            logger.error(f"[SCHOOL:{school_id}] ❌ School mismatch for import {import_id}")
            raise HTTPException(status_code=403, detail="Access denied")

        status = log.get("status")
        logger.info(f"[SCHOOL:{school_id}] ✅ Status: {status}")

        # Base response
        response = {
            "import_id": log["id"],
            "status": status,
            "file_name": log.get("file_name"),
            "zip_file_name": log.get("zip_file_name"),
            "total_rows": log.get("total_rows", 0),
            "successful_rows": log.get("successful_rows", 0),
            "failed_rows": log.get("failed_rows", 0),
            "duplicate_count": log.get("duplicate_count", 0),
            "errors": log.get("errors", [])[:100],
            "duplicate_action": log.get("duplicate_action", "skip"),
            "has_images": log.get("has_zip", False),
        }

        # Include preview data for pending state (validation complete)
        if status == "pending":
            clean_rows = log.get("_clean_rows", [])
            updatable_rows = log.get("_updatable_rows", [])
            duplicate_action = log.get("duplicate_action", "skip")
            
            response.update({
                "valid_rows": len(clean_rows) + (len(updatable_rows) if duplicate_action == "update" else 0),
                "error_rows": log.get("failed_rows", 0),
                "preview_data": [
                    {k: v for k, v in r.items() if not k.startswith("_")}
                    for r in clean_rows[:20]
                ],
            })

        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to get status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")


@router.get("/export")
async def export_students(
    class_id: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    current_user: dict = Depends(require_school_admin),
):
    """Export students as Excel file matching the template structure."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Exporting students (class={class_id}, section={section})")
    
    try:
        filters: dict = {"school_id": school_id}
        if class_id:
            filters["class_id"] = class_id
        if section:
            filters["section"] = section

        students = get_all_students(filters)

        # Map class_id (stored as DB _id strings) to human-readable class name+section
        try:
            db = get_db()
            class_ids = list({s.get('class_id') for s in students if s.get('class_id')})
            oid_list = []
            for cid in class_ids:
                try:
                    oid_list.append(ObjectId(cid))
                except Exception:
                    # skip non-ObjectId values
                    continue
            class_map = {}
            if oid_list:
                for c in db.classes.find({"_id": {"$in": oid_list}}):
                    cid_str = str(c.get("_id"))
                    cname = c.get("class_name") or c.get("name") or c.get("class") or ""
                    section_val = c.get("section") or ""
                    full_name = f"{cname}" + (f"-{section_val}" if section_val else "")
                    class_map[cid_str] = full_name

            # Replace class_id in students with readable name when available
            for s in students:
                cid = s.get('class_id')
                if cid and cid in class_map:
                    s['class_id'] = class_map[cid]
        except Exception as e:
            logger.warning(f"[SCHOOL:{school_id}] ⚠️ Could not map class names for export: {str(e)}")
        xlsx_bytes = export_students_xlsx(students)
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Exported {len(students)} students")
        
        date_str = datetime.utcnow().strftime("%Y-%m-%d")
        filename = f"students_{date_str}.xlsx"

        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.exception(f"[SCHOOL:{school_id}] ❌ Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_import_history(
    current_user: dict = Depends(require_school_admin),
):
    """Get list of past import logs."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Retrieving import history")
    
    try:
        logs = get_all_import_logs(school_id=school_id, limit=50)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(logs)} import logs")
        return [
            {
                "id": log["id"],
                "file_name": log.get("file_name", ""),
                "imported_by": log.get("imported_by", ""),
                "imported_by_name": log.get("imported_by_name", ""),
                "timestamp": log.get("timestamp", ""),
                "total_rows": log.get("total_rows", 0),
                "successful_rows": log.get("successful_rows", 0),
                "failed_rows": log.get("failed_rows", 0),
                "duplicate_count": log.get("duplicate_count", 0),
                "status": log.get("status", ""),
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to retrieve history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve history: {str(e)}")


@router.post("/incomplete-students/print-forms")
async def print_student_forms(
    class_id: str = Query(...),
    section: Optional[str] = Query(None),
    current_user: dict = Depends(require_school_admin),
):
    """Generate a single PDF containing fill-in-the-blank profile forms for all students in a class/section.

    The backend will fill available fields and leave missing fields blank. The PDF is A4 landscape
    and designed to fit approximately 3 student forms per page (stacked vertically).
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating print forms for class={class_id} section={section}")

    try:
        # Fetch students matching filters
        filters = {"school_id": school_id}
        if class_id:
            filters["class_id"] = class_id
        if section:
            filters["section"] = section

        students = get_all_students(filters)
        logger.info(f"[SCHOOL:{school_id}] Found {len(students)} students to render")

        if not students:
            raise HTTPException(status_code=404, detail="No students found for the given class/section")

        # Prepare PDF
        bio = BytesIO()
        doc = SimpleDocTemplate(
            bio,
            pagesize=landscape(A4),
            leftMargin=24,
            rightMargin=24,
            topMargin=24,
            bottomMargin=24,
        )

        styles = getSampleStyleSheet()
        # Increased font sizes for readability
        label_style = ParagraphStyle(name='Label', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=12)
        value_style = ParagraphStyle(name='Value', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=12)
        title_style = ParagraphStyle(name='Title', parent=styles['Title'], fontSize=14, leading=16)

        elements = []

        # Resolve human-readable class name (fallback to provided id)
        db = get_db()
        class_name = str(class_id)
        try:
            try:
                cid_obj = ObjectId(class_id)
            except Exception:
                cid_obj = class_id
            cls_doc = db.classes.find_one({"_id": cid_obj, "school_id": school_id}) if cid_obj else None
            if cls_doc:
                class_name = cls_doc.get('class_name') or cls_doc.get('name') or class_name
        except Exception:
            # ignore and keep class_id as fallback
            pass

        # We'll draw the document title in the page header so it doesn't consume flowable space
        header_text = f"Student Profile Forms — Class: {class_name}{(' - ' + section) if section else ''}"

        def _draw_header(canvas, doc):
            canvas.saveState()
            canvas.setFont('Helvetica-Bold', 14)
            page_width = doc.pagesize[0]
            # Move header slightly down to provide top padding above the title
            canvas.drawCentredString(page_width / 2.0, doc.pagesize[1] - 36, header_text)
            canvas.restoreState()

        # Prepare a class_id -> class_name map so student cards show readable class names
        db = get_db()
        class_ids = list({s.get('class_id') for s in students if s.get('class_id')})
        oid_list = []
        for cid in class_ids:
            try:
                oid_list.append(ObjectId(cid))
            except Exception:
                # ignore non-ObjectId class ids
                pass
        class_map = {}
        if oid_list:
            for c in db.classes.find({"_id": {"$in": oid_list}}):
                class_map[str(c.get("_id"))] = c.get('class_name') or c.get('name') or ''

        # Two-column layout: build rows of two student cards per row
        gutter = 12  # points between columns
        half_width = (doc.width - gutter) / 2

        # Add a little space after the header so tables start a bit lower on the page
        elements.append(Spacer(1, 0.18 * inch))

        def build_student_card(s: dict):
            s = s or {}
            full_name = s.get('full_name', '')
            roll = s.get('roll_number', '')
            cls_raw = s.get('class_id') or s.get('class_name') or ''
            cls_display = class_map.get(str(cls_raw), cls_raw)
            dob = s.get('date_of_birth', '')
            phone = s.get('phone') or (s.get('contact_info') or {}).get('phone') or s.get('contact_number', '')
            gender = s.get('gender', '')
            adm = s.get('admission_date', '')
            guardian = s.get('guardian_info', {}) or {}
            parent_name = guardian.get('guardian_name') or guardian.get('father_name') or guardian.get('parent_name') or s.get('parent_name', '')
            parent_cnic = guardian.get('parent_cnic') or guardian.get('father_cnic') or s.get('father_cnic', '')
            parent_contact = guardian.get('guardian_contact') or guardian.get('parent_contact') or s.get('parent_contact', '')
            # Address consolidated into a single label but displayed on two lines
            address = guardian.get('address') or s.get('address') or ''
            addr_lines = [ln.strip() for ln in address.splitlines() if ln.strip()]
            addr1 = addr_lines[0] if len(addr_lines) > 0 else (address[:60] if address else '')
            addr2 = addr_lines[1] if len(addr_lines) > 1 else (address[60:120] if len(address) > 60 else '')

            # Financial fields
            arrears = s.get('arrears') if s.get('arrears') is not None else s.get('outstanding_fees') or 0.0
            try:
                arrears_display = f"{float(arrears):.2f}"
            except Exception:
                arrears_display = str(arrears or '0.00')

            scholarship = s.get('scholarship_percentage') if s.get('scholarship_percentage') is not None else s.get('scholarship') or 0

            # Image availability based on stored profile image fields
            has_image = bool(s.get('profile_image_url') or s.get('profile_image_blob') or s.get('profile_image_path'))
            image_status = 'Present' if has_image else 'Not present'

            # Placeholders when values are missing (as per user's requested hints)
            placeholders = {
                'full_name': 'Enter student name',
                'roll': 'e.g. 101',
                'class': 'Select class',
                'dob': 'mm/dd/yyyy',
                'phone': '92XXXXXXXXXX',
                'gender': 'Select gender',
                'adm': '03/10/2026',
                'parent_name': 'Parent or guardian name',
                'parent_cnic': 'e.g. 3520112345678\nEnter 13 digits without dashes (e.g. 3520112345678)',
                'address': 'Student address',
                'parent_contact': '92XXXXXXXXXX',
                'arrears': '0.00',
                'scholarship': '0',
            }

            card_rows = []
            header_para = Paragraph(f"<b>{full_name or placeholders['full_name']}</b>", value_style)
            card_rows.append([header_para])

            # Build simplified key/value rows exactly as requested
            kv_pairs = [
                ("Full Name *", full_name or placeholders['full_name']),
                ("Roll Number *", roll or placeholders['roll']),
                ("Class *", cls_display or placeholders['class']),
                ("Date of Birth", dob or placeholders['dob']),
                ("Phone", phone or placeholders['phone']),
                ("Gender", gender or placeholders['gender']),
                ("Admission Date", adm or placeholders['adm']),
                ("Parent / Guardian Name", parent_name or placeholders['parent_name']),
                ("Parent / Guardian CNIC *", parent_cnic or placeholders['parent_cnic']),
                # Address: single label, two-line value
                ("Address", f"{addr1}<br/>{addr2}" if (addr1 or addr2) else placeholders['address']),
                ("Parent / Guardian Contact", parent_contact or placeholders['parent_contact']),
                ("Arrears (PKR)", arrears_display or placeholders['arrears']),
                ("Scholarship (%)", str(scholarship) or placeholders['scholarship']),
                ("Image", image_status),
            ]

            # Render each kv as a two-column table row inside the card
            for label, val in kv_pairs:
                left = Paragraph(label, label_style)
                right = Paragraph(str(val), value_style)
                row_table = Table([[left, right]], colWidths=[1.6 * inch, half_width - 1.6 * inch - 12])
                row_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 2),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ]))
                card_rows.append([row_table])

            # Wrap into a single cell table to create border and padding
            inner = Table(card_rows, colWidths=[half_width])
            inner.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#BBBBBB')),
                ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#EEEEEE')),
                ('LEFTPADDING', (0,0), (-1,-1), 6),
                ('RIGHTPADDING', (0,0), (-1,-1), 6),
                ('TOPPADDING', (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ]))
            return inner

        # Build rows of two cards
        i = 0
        while i < len(students):
            left = build_student_card(students[i])
            right = build_student_card(students[i+1]) if (i+1) < len(students) else Spacer(1, 0)
            outer = Table([[left, right]], colWidths=[half_width, half_width], style=[('VALIGN', (0,0), (-1,-1), 'TOP'), ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6)])
            elements.append(outer)
            elements.append(Spacer(1, 0.12 * inch))
            i += 2

        # Build PDF with header drawn on each page so title doesn't take flowable space
        doc.build(elements, onFirstPage=_draw_header, onLaterPages=_draw_header)
        bio.seek(0)

        filename = f"student_forms_{class_id}_{section or 'all'}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"

        return StreamingResponse(
            bio,
            media_type='application/pdf',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[SCHOOL:{school_id}] ❌ Failed to generate print forms: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@router.get("/notifications/stream")
async def notification_stream(
    current_user: dict = Depends(require_school_admin),
):
    """
    Server-Sent Events stream for real-time import notifications.
    The frontend should connect with EventSource.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    user_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Opening notification stream")

    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    if user_email not in _notification_queues:
        _notification_queues[user_email] = []
    _notification_queues[user_email].append(queue)

    async def event_generator():
        try:
            # Send a heartbeat immediately so the browser knows the connection is alive
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            logger.info(f"[SCHOOL:{school_id}] Notification stream closed")
        finally:
            _notification_queues.get(user_email, []).remove(queue) if queue in _notification_queues.get(user_email, []) else None

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Use 'close' to avoid server keep-alive attempting to write
            # to closed SSE connections which can raise h11 LocalProtocolError
            "Connection": "close",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Incomplete Students Endpoints
# ---------------------------------------------------------------------------

# Define which fields should be checked for missing data (dynamically extensible)
REQUIRED_STUDENT_FIELDS = {
    "section": {"path": "section", "label": "Section", "type": "string"},
    "gender": {"path": "gender", "label": "Gender", "type": "string"},
    "date_of_birth": {"path": "date_of_birth", "label": "Date of Birth", "type": "date"},
    "admission_date": {"path": "admission_date", "label": "Admission Date", "type": "date"},
}

OPTIONAL_STUDENT_FIELDS = {
    "father_name": {"path": "guardian_info.father_name", "label": "Father Name", "type": "string"},
    "mother_name": {"path": "guardian_info.mother_name", "label": "Mother Name", "type": "string"},
    "father_cnic": {"path": "guardian_info.parent_cnic", "label": "Father CNIC", "type": "string"},
    "parent_contact": {"path": "guardian_info.guardian_contact", "label": "Parent Contact", "type": "phone"},
    "guardian_email": {"path": "guardian_info.guardian_email", "label": "Guardian Email", "type": "email"},
    "address": {"path": "guardian_info.address", "label": "Address", "type": "string"},
    "emergency_contact": {"path": "contact_info.emergency_contact", "label": "Emergency Contact", "type": "phone"},
    "registration_number": {"path": "registration_number", "label": "Registration Number", "type": "string"},
}


def get_nested_value(obj: dict, path: str):
    """Get value from nested dict using dot notation"""
    keys = path.split('.')
    value = obj
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
    return value


def check_missing_fields(student: dict) -> list:
    """Dynamically check all student fields for missing data"""
    missing = []
    
    # Check all defined fields
    all_fields = {**REQUIRED_STUDENT_FIELDS, **OPTIONAL_STUDENT_FIELDS}
    
    for field_key, field_info in all_fields.items():
        value = get_nested_value(student, field_info['path'])
        
        # Check if value is missing (None, empty string, or empty dict/list)
        if value is None or value == "" or (isinstance(value, (dict, list)) and not value):
            missing.append(field_key)
    
    # Also check for profile image
    if not student.get("profile_image_blob"):
        missing.append("profile_image")
    
    return missing


@router.get("/incomplete-students")
async def get_incomplete_students(
    class_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_school_admin),
):
    """
    Get all students with incomplete/missing data, grouped by class and section.
    Dynamically detects missing fields based on Student schema.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching incomplete students (dynamic detection)")
    
    try:
        db = get_db()
        
        # Build dynamic query for any potential missing fields
        or_conditions = [
            {"data_status": "incomplete"},
            {"missing_fields": {"$exists": True, "$ne": []}},
        ]
        
        # Add conditions for each field that might be missing
        all_fields = {**REQUIRED_STUDENT_FIELDS, **OPTIONAL_STUDENT_FIELDS}
        for field_info in all_fields.values():
            or_conditions.append({field_info['path']: {"$in": [None, ""]}})
        
        query = {
            "school_id": school_id,
            "$or": or_conditions
        }
        
        if class_id:
            query["class_id"] = class_id
        
        logger.info(f"[SCHOOL:{school_id}] Querying students with potential missing data...")
        students_cursor = db.students.find(query)
        
        # Fetch class information for mapping class_id to class_name
        class_map = {}
        classes_cursor = db.classes.find({"school_id": school_id}, {"_id": 1, "class_name": 1})
        for cls in classes_cursor:
            class_map[str(cls["_id"])] = cls.get("class_name", "Unknown Class")
        
        logger.info(f"[SCHOOL:{school_id}] Loaded {len(class_map)} classes for mapping")
        
        # Group by class and section
        grouped = {}
        total_incomplete = 0
        processed_count = 0
        
        for student in students_cursor:
            processed_count += 1
            
            # Dynamically calculate missing fields
            missing = check_missing_fields(student)
            
            if not missing:
                continue  # Skip students with complete data
            
            # Get class info
            class_id_str = student.get("class_id", "Unassigned")
            class_name = class_map.get(class_id_str, class_id_str)  # Fallback to ID if not found
            section = student.get("section", "")
            
            # Group by class_id + section
            group_key = f"{class_id_str}_{section}" if section else class_id_str
            
            if group_key not in grouped:
                grouped[group_key] = {
                    "class_id": class_id_str,
                    "class_name": class_name,
                    "section": section,
                    "students": [],
                    "total_missing_fields": 0,
                }
            
            # Build current data object for all fields
            guardian = student.get("guardian_info", {}) or {}
            contact = student.get("contact_info", {}) or {}
            
            current_data = {
                "section": student.get("section", ""),
                "gender": student.get("gender", ""),
                "date_of_birth": student.get("date_of_birth", ""),
                "admission_date": student.get("admission_date", ""),
                "registration_number": student.get("registration_number", ""),
                "father_name": guardian.get("father_name", ""),
                "mother_name": guardian.get("mother_name", ""),
                "father_cnic": guardian.get("parent_cnic", ""),
                "parent_contact": guardian.get("guardian_contact", ""),
                "guardian_email": guardian.get("guardian_email", ""),
                "address": guardian.get("address", ""),
                "emergency_contact": contact.get("emergency_contact", ""),
            }
            
            student_data = {
                "id": str(student.get("_id", "")),
                "student_id": student.get("student_id", ""),
                "registration_number": student.get("registration_number", ""),
                "full_name": student.get("full_name", ""),
                "roll_number": student.get("roll_number", ""),
                "class_id": class_id_str,
                "class_name": class_name,
                "section": section,
                "missing_fields": missing,
                "current_data": current_data,
            }
            
            grouped[group_key]["students"].append(student_data)
            grouped[group_key]["total_missing_fields"] += len(missing)
            total_incomplete += 1
        
        # Sort classes alphabetically, then by section
        result = sorted(
            grouped.values(), 
            key=lambda x: (x["class_name"], x["section"])
        )
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Found {total_incomplete} students with incomplete data (processed {processed_count} total)")
        return {
            "total_incomplete_students": total_incomplete,
            "classes": result,
            "field_definitions": {**REQUIRED_STUDENT_FIELDS, **OPTIONAL_STUDENT_FIELDS}
        }
    except Exception as e:
        logger.exception(f"[SCHOOL:{school_id}] ❌ Failed to fetch incomplete students: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch incomplete students: {str(e)}")


@router.patch("/incomplete-students/{student_id}")
async def update_incomplete_student(
    student_id: str,
    updates: dict,
    current_user: dict = Depends(require_school_admin),
):
    """
    Update a student's missing fields with comprehensive validation and logging.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating student {student_id} with fields: {list(updates.keys())}")
    
    try:
        from bson.objectid import ObjectId
        db = get_db()
        
        # Find the student
        student = db.students.find_one({
            "_id": ObjectId(student_id),
            "school_id": school_id
        })
        
        if not student:
            logger.warning(f"[SCHOOL:{school_id}] Student {student_id} not found")
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Build update document
        update_doc = {"updated_at": datetime.utcnow()}
        guardian_updates = {}
        contact_updates = {}
        
        # Direct fields mapping
        direct_fields = {
            "section": "section",
            "gender": "gender",
            "date_of_birth": "date_of_birth",
            "admission_date": "admission_date",
            "registration_number": "registration_number",
        }
        
        for api_field, db_field in direct_fields.items():
            if api_field in updates and updates[api_field] not in [None, ""]:
                update_doc[db_field] = updates[api_field]
                logger.debug(f"[SCHOOL:{school_id}] Setting {db_field} = {updates[api_field]}")
        
        # Guardian info fields mapping
        guardian_fields = {
            "father_name": "father_name",
            "mother_name": "mother_name",
            "father_cnic": "parent_cnic",
            "parent_contact": "guardian_contact",
            "guardian_email": "guardian_email",
            "address": "address",
        }
        
        for api_field, db_field in guardian_fields.items():
            if api_field in updates and updates[api_field] not in [None, ""]:
                guardian_updates[f"guardian_info.{db_field}"] = updates[api_field]
                logger.debug(f"[SCHOOL:{school_id}] Setting guardian_info.{db_field} = {updates[api_field]}")
                
                # Also update contact_info.phone if parent_contact is provided
                if api_field == "parent_contact":
                    contact_updates["contact_info.phone"] = updates[api_field]
        
        # Contact info fields
        if "emergency_contact" in updates and updates["emergency_contact"] not in [None, ""]:
            contact_updates["contact_info.emergency_contact"] = updates["emergency_contact"]
            logger.debug(f"[SCHOOL:{school_id}] Setting emergency_contact")
        
        # Merge all updates
        update_doc.update(guardian_updates)
        update_doc.update(contact_updates)
        
        # Recalculate data status based on updated student
        # Merge existing data with updates to check completeness
        updated_student = {**student}
        for key, value in update_doc.items():
            if not key.startswith("guardian_info.") and not key.startswith("contact_info."):
                updated_student[key] = value
        
        # Update nested fields
        if not updated_student.get("guardian_info"):
            updated_student["guardian_info"] = {}
        if not updated_student.get("contact_info"):
            updated_student["contact_info"] = {}
        
        for key, value in guardian_updates.items():
            field_name = key.replace("guardian_info.", "")
            updated_student["guardian_info"][field_name] = value
        
        for key, value in contact_updates.items():
            field_name = key.replace("contact_info.", "")
            updated_student["contact_info"][field_name] = value
        
        # Check for remaining missing fields
        new_missing = check_missing_fields(updated_student)
        
        update_doc["data_status"] = "complete" if not new_missing else "incomplete"
        update_doc["missing_fields"] = new_missing
        
        logger.info(f"[SCHOOL:{school_id}] New data_status: {update_doc['data_status']}, remaining missing: {len(new_missing)} fields")
        
        # Perform update
        result = db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": update_doc}
        )
        
        if result.modified_count == 0:
            logger.warning(f"[SCHOOL:{school_id}] No changes made to student {student_id} (possibly duplicate data)")
        else:
            logger.info(f"[SCHOOL:{school_id}] ✅ Successfully updated student {student_id}")
        
        return {
            "success": True,
            "message": "Student updated successfully",
            "data_status": update_doc["data_status"],
            "remaining_missing_fields": new_missing,
            "modified_count": result.modified_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[SCHOOL:{school_id}] ❌ Failed to update student {student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update student: {str(e)}")


@router.post("/incomplete-students/print-forms")
async def print_incomplete_student_forms(
    class_id: str = Query(..., description="Class ID"),
    section: Optional[str] = Query(None, description="Section (optional)"),
    current_user: dict = Depends(require_school_admin),
):
    """
    Generate A4 landscape PDF with student profile forms (2-3 students per page).
    Shows existing data and leaves blanks for missing fields.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating PDF forms for class {class_id}, section {section}")
    
    try:
        from bson.objectid import ObjectId
        from io import BytesIO
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.pdfgen import canvas
        from reportlab.lib.enums import TA_LEFT, TA_CENTER
        
        db = get_db()
        
        # Fetch class info
        class_doc = db.classes.find_one({"_id": ObjectId(class_id), "school_id": school_id})
        if not class_doc:
            raise HTTPException(status_code=404, detail="Class not found")
        
        class_name = class_doc.get("class_name", "Unknown Class")
        
        # Build students query (support class_id stored as string or ObjectId)
        try:
            query = {"school_id": school_id, "$or": [{"class_id": class_id}, {"class_id": ObjectId(class_id)}]}
        except Exception:
            query = {"school_id": school_id, "class_id": class_id}

        if section:
            query["section"] = section

        students_cursor = db.students.find(query)
        students_list = []
        
        for student in students_cursor:
            missing = check_missing_fields(student)
            if missing:  # Only include students with missing data
                students_list.append({
                    "student": student,
                    "missing": missing
                })
        
        if not students_list:
            raise HTTPException(status_code=404, detail="No students with missing data found in this class/section")
        
        logger.info(f"[SCHOOL:{school_id}] Generating PDF for {len(students_list)} students")
        
        # Create PDF
        buffer = BytesIO()
        page_width, page_height = landscape(A4)
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=1*cm,
            rightMargin=1*cm,
            topMargin=1.5*cm,
            bottomMargin=1*cm,
        )
        
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=14,
            textColor=colors.HexColor('#1F4E79'),
            spaceAfter=8,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        label_style = ParagraphStyle(
            'Label',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#333333'),
            fontName='Helvetica-Bold'
        )
        
        value_style = ParagraphStyle(
            'Value',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#000000'),
        )
        
        # Process students 2 per page
        studentsper_page = 2
        
        for idx, item in enumerate(students_list):
            student = item["student"]
            missing_fields = item["missing"]
            
            guardian = student.get("guardian_info", {}) or {}
            contact = student.get("contact_info", {}) or {}
            
            # School header (small)
            school_name = student.get("school_name", "School")
            header = Paragraph(f"<b>{school_name}</b> - Student Profile Form", title_style)
            story.append(header)
            story.append(Spacer(1, 3*mm))
            
            # Define all fields to display
            form_fields = [
                ("Name", student.get("full_name", ""), "full_name"),
                ("Roll Number", student.get("roll_number", ""), "roll_number"),
                ("Registration No", student.get("registration_number", ""), "registration_number"),
                ("Class", class_name, "class"),
                ("Section", student.get("section", ""), "section"),
                ("Gender", student.get("gender", ""), "gender"),
                ("Date of Birth", student.get("date_of_birth", ""), "date_of_birth"),
                ("Admission Date", student.get("admission_date", ""), "admission_date"),
                ("Father Name", guardian.get("father_name", ""), "father_name"),
                ("Mother Name", guardian.get("mother_name", ""), "mother_name"),
                ("Father CNIC", guardian.get("parent_cnic", ""), "father_cnic"),
                ("Parent Contact", guardian.get("guardian_contact", ""), "parent_contact"),
                ("Emergency Contact", contact.get("emergency_contact", ""), "emergency_contact"),
                ("Guardian Email", guardian.get("guardian_email", ""), "guardian_email"),
                ("Address", guardian.get("address", ""), "address"),
            ]
            
            # Build table data - 2 columns of fields
            table_data = []
            for i in range(0, len(form_fields), 2):
                row = []
                
                # Left field
                label1, value1, key1 = form_fields[i]
                is_missing1 = key1 in missing_fields or key1.replace("_", "") in missing_fields or any(k in key1 for k in missing_fields)
                
                if is_missing1 or not value1:
                    display_value1 = "_" * 40  # Blank line for missing
                    cell_color1 = colors.HexColor('#FFF4E6')  # Light orange for missing
                else:
                    display_value1 = str(value1)
                    cell_color1 = colors.white
                
                cell1 = Table([
                    [Paragraph(f"<b>{label1}:</b>", label_style)],
                    [Paragraph(display_value1, value_style)]
                ], colWidths=[9*cm])
                cell1.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), cell_color1),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 3),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                    ('TOPPADDING', (0, 0), (-1, -1), 2),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ]))
                
                row.append(cell1)
                
                # Right field (if exists)
                if i + 1 < len(form_fields):
                    label2, value2, key2 = form_fields[i + 1]
                    is_missing2 = key2 in missing_fields or key2.replace("_", "") in missing_fields or any(k in key2 for k in missing_fields)
                    
                    if is_missing2 or not value2:
                        display_value2 = "_" * 40
                        cell_color2 = colors.HexColor('#FFF4E6')
                    else:
                        display_value2 = str(value2)
                        cell_color2 = colors.white
                    
                    cell2 = Table([
                        [Paragraph(f"<b>{label2}:</b>", label_style)],
                        [Paragraph(display_value2, value_style)]
                    ], colWidths=[9*cm])
                    cell2.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), cell_color2),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 3),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                        ('TOPPADDING', (0, 0), (-1, -1), 2),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ]))
                    row.append(cell2)
                else:
                    row.append("")  # Empty cell
                
                table_data.append(row)
            
            # Create main form table
            form_table = Table(table_data, colWidths=[9.5*cm, 9.5*cm], spaceBefore=0, spaceAfter=5*mm)
            form_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            story.append(form_table)
            
            # Signature line
            sig_data = [[
                Paragraph("<b>Administrator Signature:</b> ____________________", value_style),
                Paragraph("<b>Date:</b> ____________________", value_style)
            ]]
            sig_table = Table(sig_data, colWidths=[10*cm, 9*cm])
            sig_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(sig_table)
            
            # Add page break after every 2 students (except last)
            if (idx + 1) % students_per_page == 0 and (idx + 1) < len(students_list):
                story.append(PageBreak())
            else:
                story.append(Spacer(1, 5*mm))  # Space between forms on same page
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Generated PDF with {len(students_list)} student forms")
        
        from datetime import datetime
        filename = f"student_forms_{class_name.replace(' ', '_')}_{section or 'all'}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[SCHOOL:{school_id}] ❌ Failed to generate PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")
