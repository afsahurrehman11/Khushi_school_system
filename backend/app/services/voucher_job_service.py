"""
Voucher Job Service
Handles background generation of fee vouchers for large classes
"""
import logging
import threading
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from app.database import get_db
from app.services.fee_voucher_service import (
    generate_class_vouchers_zip,
    generate_class_vouchers_combined_pdf
)

logger = logging.getLogger(__name__)

# In-memory job store (for simple implementation)
# In production, this should be Redis or a proper message queue
_job_store: Dict[str, Dict[str, Any]] = {}
_job_lock = threading.Lock()

# Cleanup old jobs older than 1 hour
JOB_EXPIRY_MINUTES = 60


def create_voucher_job(
    job_type: str,
    class_id: str,
    school_id: str,
    user_id: str
) -> str:
    """
    Create a background job for voucher generation.
    
    Args:
        job_type: 'zip' or 'pdf'
        class_id: Class ID
        school_id: School ID
        user_id: User who initiated the job
    
    Returns:
        job_id: Unique job identifier
    """
    job_id = str(uuid.uuid4())
    
    with _job_lock:
        _job_store[job_id] = {
            "job_id": job_id,
            "job_type": job_type,
            "class_id": class_id,
            "school_id": school_id,
            "user_id": user_id,
            "status": "pending",  # pending, processing, completed, failed
            "progress": 0,
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "result_data": None,  # Will store the generated file bytes
            "result_size": 0
        }
    
    logger.info(f"[VOUCHER_JOB] Created job {job_id} ({job_type}) for class {class_id}")
    
    # Start background thread
    thread = threading.Thread(
        target=_process_voucher_job,
        args=(job_id,),
        daemon=True
    )
    thread.start()
    
    return job_id


def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    """Get the status of a voucher job"""
    with _job_lock:
        job = _job_store.get(job_id)
        if not job:
            return None
        
        # Return job info without the large result_data
        return {
            "job_id": job["job_id"],
            "job_type": job["job_type"],
            "class_id": job["class_id"],
            "status": job["status"],
            "progress": job["progress"],
            "created_at": job["created_at"].isoformat(),
            "started_at": job["started_at"].isoformat() if job["started_at"] else None,
            "completed_at": job["completed_at"].isoformat() if job["completed_at"] else None,
            "error": job["error"],
            "result_size": job["result_size"]
        }


def get_job_result(job_id: str) -> Optional[bytes]:
    """Get the result data for a completed job"""
    with _job_lock:
        job = _job_store.get(job_id)
        if not job or job["status"] != "completed":
            return None
        return job["result_data"]


def cleanup_old_jobs():
    """Remove jobs older than JOB_EXPIRY_MINUTES"""
    expiry_time = datetime.utcnow() - timedelta(minutes=JOB_EXPIRY_MINUTES)
    
    with _job_lock:
        expired_jobs = [
            job_id for job_id, job in _job_store.items()
            if job["created_at"] < expiry_time
        ]
        
        for job_id in expired_jobs:
            del _job_store[job_id]
            logger.info(f"[VOUCHER_JOB] Cleaned up expired job {job_id}")


def _process_voucher_job(job_id: str):
    """Background worker function to process voucher generation"""
    try:
        with _job_lock:
            job = _job_store.get(job_id)
            if not job:
                logger.error(f"[VOUCHER_JOB] Job {job_id} not found")
                return
            
            job["status"] = "processing"
            job["started_at"] = datetime.utcnow()
            job["progress"] = 10
        
        logger.info(f"[VOUCHER_JOB] Starting job {job_id}")
        
        # Get database connection
        db = get_db()
        
        # Update progress
        with _job_lock:
            _job_store[job_id]["progress"] = 30
        
        # Generate the file based on job type
        if job["job_type"] == "zip":
            logger.info(f"[VOUCHER_JOB] Generating ZIP for job {job_id}")
            result_data = generate_class_vouchers_zip(
                job["class_id"],
                job["school_id"],
                db
            )
            
        elif job["job_type"] == "pdf":
            logger.info(f"[VOUCHER_JOB] Generating combined PDF for job {job_id}")
            result_data = generate_class_vouchers_combined_pdf(
                job["class_id"],
                job["school_id"],
                db
            )
        else:
            raise ValueError(f"Unknown job type: {job['job_type']}")
        
        # Store result
        with _job_lock:
            _job_store[job_id]["status"] = "completed"
            _job_store[job_id]["progress"] = 100
            _job_store[job_id]["completed_at"] = datetime.utcnow()
            _job_store[job_id]["result_data"] = result_data
            _job_store[job_id]["result_size"] = len(result_data)
        
        logger.info(f"[VOUCHER_JOB] ✅ Job {job_id} completed successfully ({len(result_data)} bytes)")
        
    except Exception as e:
        logger.error(f"[VOUCHER_JOB] ❌ Job {job_id} failed: {str(e)}", exc_info=True)
        
        with _job_lock:
            if job_id in _job_store:
                _job_store[job_id]["status"] = "failed"
                _job_store[job_id]["error"] = str(e)
                _job_store[job_id]["completed_at"] = datetime.utcnow()
