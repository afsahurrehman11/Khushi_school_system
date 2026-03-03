"""
Analytics Job Service
Minimal in-memory background job runner for heavy analytics precomputation.
This mirrors the existing voucher job pattern. For production use, migrate to
Redis/Celery or another durable queue.
"""
import logging
import threading
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from app.database import get_db
from app.routers import analytics as analytics_router_module

logger = logging.getLogger(__name__)

# In-memory job store (simple implementation)
_job_store: Dict[str, Dict[str, Any]] = {}
_job_lock = threading.Lock()

# Jobs expire after 2 hours
JOB_EXPIRY_MINUTES = 120


def create_analytics_job(user_id: str, school_id: str, job_params: Dict[str, Any]) -> str:
    job_id = str(uuid.uuid4())
    with _job_lock:
        _job_store[job_id] = {
            "job_id": job_id,
            "user_id": user_id,
            "school_id": school_id,
            "params": job_params,
            "status": "pending",
            "progress": 0,
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "result": None,
        }

    thread = threading.Thread(target=_process_analytics_job, args=(job_id,), daemon=True)
    thread.start()
    logger.info(f"[ANALYTICS_JOB] Created job {job_id} for school {school_id}")
    return job_id


def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    with _job_lock:
        job = _job_store.get(job_id)
        if not job:
            return None
        # Return meta without large result
        return {
            "job_id": job["job_id"],
            "status": job["status"],
            "progress": job["progress"],
            "created_at": job["created_at"].isoformat(),
            "started_at": job["started_at"].isoformat() if job["started_at"] else None,
            "completed_at": job["completed_at"].isoformat() if job["completed_at"] else None,
            "error": job["error"],
        }


def get_job_result(job_id: str) -> Optional[Any]:
    with _job_lock:
        job = _job_store.get(job_id)
        if not job or job["status"] != "completed":
            return None
        return job["result"]


def cleanup_old_jobs():
    expiry_time = datetime.utcnow() - timedelta(minutes=JOB_EXPIRY_MINUTES)
    with _job_lock:
        expired = [jid for jid, j in _job_store.items() if j["created_at"] < expiry_time]
        for jid in expired:
            del _job_store[jid]
            logger.info(f"[ANALYTICS_JOB] Cleaned up expired job {jid}")


def _process_analytics_job(job_id: str):
    try:
        with _job_lock:
            job = _job_store.get(job_id)
            if not job:
                logger.error(f"[ANALYTICS_JOB] Job {job_id} not found")
                return
            job["status"] = "processing"
            job["started_at"] = datetime.utcnow()
            job["progress"] = 10

        logger.info(f"[ANALYTICS_JOB] Starting job {job_id}")

        db = get_db()

        # Example heavy computations: reuse analytics router helper endpoints logic
        # Here we'll compute overview, fee summary and attendance summary as a sample
        result = {}

        # Dashboard overview
        try:
            result["overview"] = analytics_router_module.get_dashboard_overview.__wrapped__(  # type: ignore
                current_user={"school_id": job["school_id"]}
            )
        except Exception as e:
            logger.warning(f"[ANALYTICS_JOB] Overview compute failed: {e}")
            result["overview_error"] = str(e)

        # Fee summary (month)
        try:
            result["fee_summary"] = analytics_router_module.get_fee_summary.__wrapped__(  # type: ignore
                period="month",
                current_user={"school_id": job["school_id"]}
            )
        except Exception as e:
            logger.warning(f"[ANALYTICS_JOB] Fee summary failed: {e}")
            result["fee_summary_error"] = str(e)

        # Attendance summary (month)
        try:
            result["attendance_summary"] = analytics_router_module.get_attendance_summary.__wrapped__(  # type: ignore
                period="month",
                class_id=None,
                current_user={"school_id": job["school_id"]}
            )
        except Exception as e:
            logger.warning(f"[ANALYTICS_JOB] Attendance summary failed: {e}")
            result["attendance_summary_error"] = str(e)

        with _job_lock:
            _job_store[job_id]["status"] = "completed"
            _job_store[job_id]["progress"] = 100
            _job_store[job_id]["completed_at"] = datetime.utcnow()
            _job_store[job_id]["result"] = result

        logger.info(f"[ANALYTICS_JOB] ✅ Job {job_id} completed")

    except Exception as e:
        logger.error(f"[ANALYTICS_JOB] ❌ Job {job_id} failed: {e}", exc_info=True)
        with _job_lock:
            if job_id in _job_store:
                _job_store[job_id]["status"] = "failed"
                _job_store[job_id]["error"] = str(e)
                _job_store[job_id]["completed_at"] = datetime.utcnow()
