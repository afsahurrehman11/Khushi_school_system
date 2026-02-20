"""
Student Import / Export Router — Admin-only.

Endpoints:
  GET   /students-import-export/sample-template        — download sample xlsx
  POST  /students-import-export/upload                  — upload & validate (returns preview)
  POST  /students-import-export/confirm/{log_id}        — confirm import after preview
  GET   /students-import-export/status/{log_id}         — poll import status
  GET   /students-import-export/error-report/{log_id}   — download error xlsx
  GET   /students-import-export/export                  — export students xlsx
  GET   /students-import-export/history                 — import history list
  GET   /students-import-export/notifications/stream    — SSE stream for realtime notifications
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
from app.services.excel_service import (
    MAX_FILE_SIZE,
    generate_sample_template,
    parse_and_validate_rows,
    check_db_duplicates,
    execute_import_transaction,
    export_students_xlsx,
    generate_error_report,
)
from app.services.import_log_service import (
    create_import_log,
    update_import_log,
    get_import_log,
    get_all_import_logs,
)
from app.services.student import get_all_students
from app.services.bulk_import_service import (
    validate_zip_file_path,
    execute_import_with_images,
    MAX_ZIP_SIZE,
)

logger = logging.getLogger(__name__)

router = APIRouter()

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
    Validates both files and returns a preview. No database writes happen here.
    
    ZIP file rules:
    - Maximum size: 50MB
    - Allowed image formats: jpg, jpeg, png
    - Image filenames must match the Image_Name column in Excel
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
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

        content = await file.read()

        # Size check for Excel
        if len(content) > MAX_FILE_SIZE:
            logger.error(f"🔴 [BULK] Excel file too large: {len(content)} bytes")
            raise HTTPException(status_code=400, detail="Excel file exceeds maximum size of 10MB.")

        # Process ZIP file if provided
        zip_path = None
        zip_validation_error = None

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
                raise HTTPException(status_code=400, detail="Invalid ZIP file type. Only .zip files are accepted.")

            # Stream uploaded ZIP to a temporary file to avoid storing bytes in memory or DB
            tmp_file = None
            try:
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
                tmp_file = tmp.name
                # copyfileobj is blocking — run in thread to avoid blocking event loop
                await asyncio.to_thread(shutil.copyfileobj, images_zip.file, tmp)
                tmp.close()

                # Validate ZIP size and integrity via path-based validator
                is_valid, error_msg = validate_zip_file_path(tmp_file)
                if not is_valid:
                    # remove temp file on validation failure
                    try:
                        os.remove(tmp_file)
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
                logger.exception(f"🔴 [BULK] Failed to store/validate ZIP: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Failed to process ZIP file: {str(e)}")

        # Parse & validate Excel
        try:
            result = parse_and_validate_rows(content)
        except Exception as e:
            logger.exception(f"🔴 [BULK] Parse error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")

        # Check DB duplicates for valid rows
        db = get_db()
        clean_rows, db_dup_rows, updatable_rows = check_db_duplicates(result["valid_rows"], db, school_id=school_id)

        all_errors = result["error_rows"] + result["duplicate_rows"] + db_dup_rows
        all_duplicate_count = len(result["duplicate_rows"]) + len(db_dup_rows)

        # Create an import log entry in "pending" state (preview stage)
        log_entry = create_import_log({
            "school_id": school_id,
            "file_name": file.filename or "unknown.xlsx",
            "zip_file_name": images_zip.filename if images_zip else None,
            "imported_by": admin_email,
            "imported_by_name": current_user.get("name", ""),
            "total_rows": result["total_rows"],
            "successful_rows": 0,
            "failed_rows": len(result["error_rows"]),
            "duplicate_count": all_duplicate_count,
            "status": "pending",
            "errors": all_errors,
            "duplicate_action": duplicate_action,
            "has_zip": zip_path is not None,
            # Stash validated rows for the confirm step (stored in DB as temp)
            "_clean_rows": clean_rows,
            "_updatable_rows": updatable_rows,
            "_zip_path": zip_path,  # Store temp ZIP path for confirm step
        })

        logger.info(f"🟢 [BULK] Validated: {len(clean_rows)} valid rows, {all_duplicate_count} duplicates")
        
        return {
            "import_id": log_entry["id"],
            "file_name": file.filename,
            "zip_file_name": images_zip.filename if images_zip else None,
            "total_rows": result["total_rows"],
            "valid_rows": len(clean_rows) + (len(updatable_rows) if duplicate_action == "update" else 0),
            "error_rows": len(result["error_rows"]),
            "duplicate_rows": all_duplicate_count,
            "errors": all_errors[:100],  # cap preview at 100 errors
            "duplicate_action": duplicate_action,
            "has_images": zip_path is not None,
            "preview_data": [
                {k: v for k, v in r.items() if not k.startswith("_")}
                for r in clean_rows[:20]
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴 [BULK] Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


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
            _run_import_background(import_id, admin_email, school_id)
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


async def _run_import_background(import_id: str, user_email: str, school_id: str):
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

        db = get_db()

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

        # After processing, remove temp zip file if present
        try:
            if zip_path and os.path.exists(zip_path):
                os.remove(zip_path)
                logger.info(f"🟢 [BULK] Removed temp ZIP: {zip_path}")
        except Exception:
            logger.warning(f"⚠️ [BULK] Failed to remove temp ZIP: {zip_path}")

        update_import_log(import_id, {
            "status": status,
            "successful_rows": success,
            "failed_rows": fail + log.get("failed_rows", 0),
            "errors": all_errors,
            # Remove temp stashed data
            "_clean_rows": [],
            "_updatable_rows": [],
            "_zip_path": None,
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
                                    "embedding_model": "VGGFace2",
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
                f"{success} students imported successfully. {fail + log.get('failed_rows', 0)} failed."
                if status == "completed"
                else f"Import finished with errors. {success} succeeded, {fail + log.get('failed_rows', 0)} failed. Download the error report."
            ),
            "timestamp": datetime.utcnow().isoformat(),
        }
        _publish_notification(user_email, notification)

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
    """Poll import status."""
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

        logger.info(f"[SCHOOL:{school_id}] ✅ Status: {log.get('status')}")
        return {
            "import_id": log["id"],
            "status": log.get("status"),
            "file_name": log.get("file_name"),
            "total_rows": log.get("total_rows", 0),
            "successful_rows": log.get("successful_rows", 0),
            "failed_rows": log.get("failed_rows", 0),
            "duplicate_count": log.get("duplicate_count", 0),
            "errors": log.get("errors", [])[:100],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to get status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")


@router.get("/error-report/{import_id}")
async def download_error_report(
    import_id: str,
    current_user: dict = Depends(require_school_admin),
):
    """Download the error report as an Excel file."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Downloading error report for {import_id}")
    
    try:
        log = get_import_log(import_id)
        if not log:
            logger.error(f"[SCHOOL:{school_id}] ❌ Import log not found: {import_id}")
            raise HTTPException(status_code=404, detail="Import log not found")
        
        # Verify school_id matches
        if log.get("school_id") != school_id:
            logger.error(f"[SCHOOL:{school_id}] ❌ School mismatch for import {import_id}")
            raise HTTPException(status_code=403, detail="Access denied")

        errors = log.get("errors", [])
        if not errors:
            logger.error(f"[SCHOOL:{school_id}] ❌ No errors to report for {import_id}")
            raise HTTPException(status_code=404, detail="No errors to report")

        xlsx_bytes = generate_error_report(errors)
        logger.info(f"[SCHOOL:{school_id}] ✅ Error report generated")
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="students_import_errors.xlsx"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to generate error report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate error report: {str(e)}")


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
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
