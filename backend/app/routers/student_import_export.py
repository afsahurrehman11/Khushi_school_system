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
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse, Response

from app.dependencies.auth import get_current_user
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
    role = (current_user.get("role") or "").strip()
    if role != "Admin":
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
    xlsx_bytes = generate_sample_template()
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="students_import_template.xlsx"'},
    )


@router.post("/upload")
async def upload_and_validate(
    file: UploadFile = File(...),
    duplicate_action: str = Form("skip"),
    current_user: dict = Depends(require_school_admin),
):
    """
    Upload an Excel file, validate it, check duplicates, and return a preview.
    No database writes happen here.
    """
    # File type check
    allowed_types = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    }
    if file.content_type not in allowed_types and not (file.filename or "").endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Invalid file type. Only .xlsx / .xls files are accepted.")

    content = await file.read()

    # Size check
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds maximum size of 10MB.")

    # Parse & validate
    try:
        result = parse_and_validate_rows(content)
    except Exception as e:
        logger.exception("Parse error")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    # Check DB duplicates for valid rows
    db = get_db()
    clean_rows, db_dup_rows, updatable_rows = check_db_duplicates(result["valid_rows"], db)

    all_errors = result["error_rows"] + result["duplicate_rows"] + db_dup_rows
    all_duplicate_count = len(result["duplicate_rows"]) + len(db_dup_rows)

    # Create an import log entry in "pending" state (preview stage)
    log_entry = create_import_log({
        "file_name": file.filename or "unknown.xlsx",
        "imported_by": current_user.get("email", ""),
        "imported_by_name": current_user.get("name", ""),
        "total_rows": result["total_rows"],
        "successful_rows": 0,
        "failed_rows": len(result["error_rows"]),
        "duplicate_count": all_duplicate_count,
        "status": "pending",
        "errors": all_errors,
        "duplicate_action": duplicate_action,
        # Stash validated rows for the confirm step (stored in DB as temp)
        "_clean_rows": clean_rows,
        "_updatable_rows": updatable_rows,
    })

    return {
        "import_id": log_entry["id"],
        "file_name": file.filename,
        "total_rows": result["total_rows"],
        "valid_rows": len(clean_rows) + (len(updatable_rows) if duplicate_action == "update" else 0),
        "error_rows": len(result["error_rows"]),
        "duplicate_rows": all_duplicate_count,
        "errors": all_errors[:100],  # cap preview at 100 errors
        "duplicate_action": duplicate_action,
        "preview_data": [
            {k: v for k, v in r.items() if not k.startswith("_")}
            for r in clean_rows[:20]
        ],
    }


@router.post("/confirm/{import_id}")
async def confirm_import(
    import_id: str,
    current_user: dict = Depends(require_school_admin),
):
    """
    Confirm and execute the import after preview.
    Launches background processing and returns immediately.
    """
    log = get_import_log(import_id)
    if not log:
        raise HTTPException(status_code=404, detail="Import log not found")

    if log.get("status") not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Import is already {log.get('status')}. Cannot re-confirm.")

    # Mark as processing
    update_import_log(import_id, {"status": "processing"})

    # Launch background task
    asyncio.get_event_loop().create_task(
        _run_import_background(import_id, current_user.get("email", ""))
    )

    return {
        "message": "Import started. You will receive a notification when the process completes.",
        "import_id": import_id,
    }


async def _run_import_background(import_id: str, user_email: str):
    """Background coroutine that performs the actual database writes."""
    try:
        log = get_import_log(import_id)
        if not log:
            return

        clean_rows = log.get("_clean_rows", [])
        updatable_rows = log.get("_updatable_rows", [])
        duplicate_action = log.get("duplicate_action", "skip")

        db = get_db()

        rows_to_update = updatable_rows if duplicate_action == "update" else []

        success, fail, exec_errors = await asyncio.to_thread(
            execute_import_transaction,
            clean_rows,
            rows_to_update,
            duplicate_action,
            db,
        )

        all_errors = log.get("errors", []) + exec_errors
        total_attempted = len(clean_rows) + len(rows_to_update)

        status = "completed"
        if fail > 0 or exec_errors:
            status = "completed_with_errors" if success > 0 else "failed"

        update_import_log(import_id, {
            "status": status,
            "successful_rows": success,
            "failed_rows": fail + log.get("failed_rows", 0),
            "errors": all_errors,
            # Remove temp stashed rows
            "_clean_rows": [],
            "_updatable_rows": [],
        })

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
        logger.exception("Background import failed for %s", import_id)
        update_import_log(import_id, {
            "status": "failed",
            "errors": [{"row": 0, "column": "-", "value": "-", "reason": "Internal server error during import"}],
            "_clean_rows": [],
            "_updatable_rows": [],
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
    log = get_import_log(import_id)
    if not log:
        raise HTTPException(status_code=404, detail="Import log not found")

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


@router.get("/error-report/{import_id}")
async def download_error_report(
    import_id: str,
    current_user: dict = Depends(require_school_admin),
):
    """Download the error report as an Excel file."""
    log = get_import_log(import_id)
    if not log:
        raise HTTPException(status_code=404, detail="Import log not found")

    errors = log.get("errors", [])
    if not errors:
        raise HTTPException(status_code=404, detail="No errors to report")

    xlsx_bytes = generate_error_report(errors)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="students_import_errors.xlsx"'},
    )


@router.get("/export")
async def export_students(
    class_id: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    current_user: dict = Depends(require_school_admin),
):
    """Export students as Excel file matching the template structure."""
    filters: dict = {}
    if class_id:
        filters["class_id"] = class_id
    if section:
        filters["section"] = section

    try:
        students = get_all_students(filters)
        xlsx_bytes = export_students_xlsx(students)
    except Exception as e:
        logger.exception("Export failed")
        raise HTTPException(status_code=500, detail=str(e))

    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"students_{date_str}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/history")
async def get_import_history(
    current_user: dict = Depends(require_school_admin),
):
    """Get list of past import logs."""
    logs = get_all_import_logs(limit=50)
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


@router.get("/notifications/stream")
async def notification_stream(
    current_user: dict = Depends(require_school_admin),
):
    """
    Server-Sent Events stream for real-time import notifications.
    The frontend should connect with EventSource.
    """
    user_email = current_user.get("email", "")

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
            pass
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
