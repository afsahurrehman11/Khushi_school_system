"""
SaaS Background Jobs
Daily usage snapshot and scheduled tasks for the multi-tenant SaaS system
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
import logging

from app.services.saas_db import get_saas_root_db
from app.services.saas_service import (
    create_usage_snapshot, update_school_stats, get_all_saas_schools
)
from app.models.saas import SchoolStatus

logger = logging.getLogger(__name__)


class UsageSnapshotJob:
    """
    Background job that captures daily usage snapshots for all schools.
    Run this job once per day (e.g., via scheduler or cron).
    """
    
    def __init__(self):
        self.is_running = False
        self.last_run: Optional[datetime] = None
        self.stop_event: Optional[asyncio.Event] = None
    
    async def run_snapshot_for_all_schools(self) -> dict:
        """
        Create usage snapshots for all active schools.
        Returns summary of results.
        """
        logger.info("[SNAPSHOT_JOB] Starting daily usage snapshot job")

        root_db = get_saas_root_db()

        # Prevent frequent duplicate runs across processes by checking a persisted last_run.
        try:
            job_doc = root_db.system_jobs.find_one({"job": "usage_snapshot"}) or {}
            last_run = job_doc.get("last_run")
            if last_run:
                # last_run stored as datetime in DB
                delta = datetime.utcnow() - last_run
                # If last run was within 50 minutes, skip to avoid duplicate overlapping runs
                # (we schedule the job hourly; use a slightly smaller guard)
                if delta.total_seconds() < (50 * 60):
                    logger.info("[SNAPSHOT_JOB] Skipping run - recently executed")
                    return {"total": 0, "successful": 0, "failed": 0, "skipped": 0, "errors": []}
        except Exception:
            # If system_jobs not available, continue normally
            pass
        
        # Get all active schools
        schools = list(root_db.schools.find({
            "status": {"$ne": SchoolStatus.DELETED.value}
        }))
        
        results = {
            "total": len(schools),
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "errors": []
        }
        
        for school in schools:
            school_id = school.get("school_id")
            school_name = school.get("school_name")
            
            try:
                # Create snapshot
                snapshot = create_usage_snapshot(school_id)
                
                if snapshot:
                    # Also update the cached stats in the school document
                    update_school_stats(school_id)
                    results["successful"] += 1
                    logger.debug(f"[SNAPSHOT_JOB] ✅ Snapshot created for {school_name}")
                else:
                    results["skipped"] += 1
                    logger.warning(f"[SNAPSHOT_JOB] ⚠️ Skipped {school_name} - no snapshot created")
                    
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({
                    "school_id": school_id,
                    "school_name": school_name,
                    "error": str(e)
                })
                logger.error(f"[SNAPSHOT_JOB] ❌ Failed for {school_name}: {e}")
        
        self.last_run = datetime.utcnow()
        # persist last_run to system_jobs for cross-process guard
        try:
            root_db.system_jobs.update_one({"job": "usage_snapshot"}, {"$set": {"last_run": self.last_run}}, upsert=True)
        except Exception:
            pass
        
        logger.info(
            f"[SNAPSHOT_JOB] Completed: {results['successful']}/{results['total']} successful, "
            f"{results['failed']} failed, {results['skipped']} skipped"
        )
        
        return results
    
    async def start_scheduled_job(self, interval_hours: int = 24):
        """
        Start the scheduled background job.
        Runs at the specified interval (default: every 24 hours).
        """
        self.is_running = True
        self.stop_event = asyncio.Event()
        
        logger.info(f"[SNAPSHOT_JOB] 🚀 Starting scheduled job (interval: {interval_hours}h)")
        
        # Wait a bit before first run to let the app fully start
        try:
            await asyncio.wait_for(self.stop_event.wait(), timeout=60)
            return  # Stop event was set
        except asyncio.TimeoutError:
            pass  # Continue to first run
        
        while not self.stop_event.is_set():
            try:
                # Run the snapshot job
                await self.run_snapshot_for_all_schools()
                
            except Exception as e:
                logger.error(f"[SNAPSHOT_JOB] ❌ Scheduled run failed: {e}")
            
            # Wait for next run
            try:
                await asyncio.wait_for(
                    self.stop_event.wait(),
                    timeout=interval_hours * 3600
                )
                break  # Stop event was set
            except asyncio.TimeoutError:
                pass  # Continue to next run
        
        self.is_running = False
        logger.info("[SNAPSHOT_JOB] 🛑 Scheduled job stopped")
    
    def stop(self):
        """Stop the scheduled job"""
        if self.stop_event:
            self.stop_event.set()
        self.is_running = False


class BillingCheckJob:
    """
    Background job that checks for overdue payments and auto-suspends schools.
    Runs daily to enforce payment deadlines.
    """
    
    def __init__(self, grace_period_days: int = 7):
        self.grace_period_days = grace_period_days
        self.is_running = False
        self.last_run: Optional[datetime] = None
        self.stop_event: Optional[asyncio.Event] = None
    
    async def check_and_suspend_overdue(self) -> dict:
        """
        Check all active schools for overdue payments and auto-suspend them.
        Returns summary of results.
        """
        from app.services.saas_service import check_and_suspend_overdue_schools
        
        logger.info("[BILLING_JOB] Starting overdue payment check")
        
        try:
            results = check_and_suspend_overdue_schools(self.grace_period_days)
            self.last_run = datetime.utcnow()
            
            logger.info(
                f"[BILLING_JOB] Completed: {results.get('suspended', 0)} schools suspended, "
                f"{results.get('checked', 0)} checked, {results.get('errors', 0)} errors"
            )
            
            return results
            
        except Exception as e:
            logger.error(f"[BILLING_JOB] ❌ Billing check failed: {e}")
            return {"error": str(e)}
    
    async def start_scheduled_job(self, interval_hours: int = 24):
        """
        Start the scheduled billing check job.
        Runs daily by default.
        """
        self.is_running = True
        self.stop_event = asyncio.Event()
        
        logger.info(f"[BILLING_JOB] 🚀 Starting scheduled billing check (interval: {interval_hours}h)")
        
        # Wait 2 hours before first run to let the app stabilize
        try:
            await asyncio.wait_for(self.stop_event.wait(), timeout=7200)
            return  # Stop event was set
        except asyncio.TimeoutError:
            pass  # Continue to first run
        
        while not self.stop_event.is_set():
            try:
                await self.check_and_suspend_overdue()
            except Exception as e:
                logger.error(f"[BILLING_JOB] ❌ Scheduled run failed: {e}")
            
            try:
                await asyncio.wait_for(
                    self.stop_event.wait(),
                    timeout=interval_hours * 3600
                )
                break  # Stop event was set
            except asyncio.TimeoutError:
                pass  # Continue to next run
        
        self.is_running = False
        logger.info("[BILLING_JOB] 🛑 Scheduled billing check stopped")
    
    def stop(self):
        """Stop the scheduled job"""
        if self.stop_event:
            self.stop_event.set()
        self.is_running = False


class DataCleanupJob:
    """
    Background job for cleaning up old data.
    - Removes old usage snapshots (older than retention period)
    - Cleans up deleted schools after grace period
    """
    
    def __init__(self, snapshot_retention_days: int = 90, deletion_grace_days: int = 30):
        self.snapshot_retention_days = snapshot_retention_days
        self.deletion_grace_days = deletion_grace_days
        self.is_running = False
        self.stop_event: Optional[asyncio.Event] = None
    
    async def cleanup_old_snapshots(self) -> int:
        """Remove usage snapshots older than retention period"""
        root_db = get_saas_root_db()
        
        cutoff_date = datetime.utcnow() - timedelta(days=self.snapshot_retention_days)
        
        result = root_db.usage_snapshots.delete_many({
            "date": {"$lt": cutoff_date}
        })
        
        deleted_count = result.deleted_count
        if deleted_count > 0:
            logger.info(f"[CLEANUP_JOB] 🗑️ Removed {deleted_count} old usage snapshots")
        
        return deleted_count
    
    async def cleanup_deleted_schools(self) -> int:
        """
        Permanently remove schools that have been soft-deleted
        for longer than the grace period.
        """
        from app.services.saas_service import delete_saas_school
        
        root_db = get_saas_root_db()
        
        cutoff_date = datetime.utcnow() - timedelta(days=self.deletion_grace_days)
        
        # Find schools deleted before cutoff
        deleted_schools = list(root_db.schools.find({
            "status": SchoolStatus.DELETED.value,
            "deleted_at": {"$lt": cutoff_date}
        }))
        
        removed_count = 0

        # Process deleted schools sequentially and safely delete them.
        # We avoid heavy concurrency here to keep the operation simple and predictable.
        for school in deleted_schools:
            school_id = school.get("school_id")
            school_name = school.get("school_name")
            try:
                delete_saas_school(school_id)
                removed_count += 1
                logger.info(f"[CLEANUP_JOB] ✅ Permanently removed deleted school: {school_name}")
            except Exception as e:
                logger.error(f"[CLEANUP_JOB] ❌ Failed to remove {school_name}: {e}")

        return removed_count

    async def run_cleanup(self) -> dict:
        """Run cleanup subtasks and return a summary."""
        logger.info("[CLEANUP_JOB] 🔄 Running cleanup tasks")
        try:
            snapshots_removed = await self.cleanup_old_snapshots()
            schools_removed = await self.cleanup_deleted_schools()
            self.last_run = datetime.utcnow()
            logger.info(f"[CLEANUP_JOB] Completed: {snapshots_removed} snapshots removed, {schools_removed} schools removed")
            return {"snapshots_removed": snapshots_removed, "schools_removed": schools_removed}
        except Exception as e:
            logger.error(f"[CLEANUP_JOB] ❌ Cleanup run failed: {e}")
            return {"error": str(e)}
    
    async def start_scheduled_job(self, interval_hours: int = 24):
        """Start the scheduled cleanup job"""
        self.is_running = True
        self.stop_event = asyncio.Event()
        
        logger.info(f"[CLEANUP_JOB] 🚀 Starting scheduled cleanup (interval: {interval_hours}h)")
        
        while not self.stop_event.is_set():
            try:
                await self.run_cleanup()
            except Exception as e:
                logger.error(f"[CLEANUP_JOB] ❌ Cleanup failed: {e}")
            
            try:
                await asyncio.wait_for(
                    self.stop_event.wait(),
                    timeout=interval_hours * 3600
                )
                break
            except asyncio.TimeoutError:
                pass
        
        self.is_running = False
        logger.info("[CLEANUP_JOB] 🛑 Scheduled cleanup stopped")
    
    def stop(self):
        """Stop the scheduled job"""
        if self.stop_event:
            self.stop_event.set()
        self.is_running = False


# Global job instances
_snapshot_job: Optional[UsageSnapshotJob] = None
_cleanup_job: Optional[DataCleanupJob] = None
_billing_job: Optional[BillingCheckJob] = None


def get_snapshot_job() -> UsageSnapshotJob:
    """Get or create the snapshot job instance"""
    global _snapshot_job
    if _snapshot_job is None:
        _snapshot_job = UsageSnapshotJob()
    return _snapshot_job


def get_cleanup_job() -> DataCleanupJob:
    """Get or create the cleanup job instance"""
    global _cleanup_job
    if _cleanup_job is None:
        _cleanup_job = DataCleanupJob()
    return _cleanup_job


def get_billing_job() -> BillingCheckJob:
    """Get or create the billing check job instance"""
    global _billing_job
    if _billing_job is None:
        _billing_job = BillingCheckJob()
    return _billing_job


async def start_background_jobs():
    """Start all background jobs (called from app startup)"""
    snapshot_job = get_snapshot_job()
    cleanup_job = get_cleanup_job()
    billing_job = get_billing_job()
    
    # Start jobs in background
    # Snapshot job scheduled to run every 1 hour
    asyncio.create_task(snapshot_job.start_scheduled_job(interval_hours=1))
    asyncio.create_task(cleanup_job.start_scheduled_job(interval_hours=48))
    asyncio.create_task(billing_job.start_scheduled_job(interval_hours=24))
    # Start embedding sync job (polling fallback for change-stream updates)
    try:
        embedding_job = EmbeddingSyncJob()
        asyncio.create_task(embedding_job.start_scheduled_job())
        logger.info("[BACKGROUND_JOBS] ✅ Embedding sync job started")
    except Exception as e:
        logger.warning(f"[BACKGROUND_JOBS] ⚠️ Failed to start embedding sync job: {e}")

    logger.info("[BACKGROUND_JOBS] ✅ Background jobs started")


async def stop_background_jobs():
    """Stop all background jobs (called from app shutdown)"""
    if _snapshot_job:
        _snapshot_job.stop()
    if _cleanup_job:
        _cleanup_job.stop()
    if _billing_job:
        _billing_job.stop()
    # Note: EmbeddingSyncJob stop handled by event loop shutdown
    # Give jobs time to stop gracefully
    await asyncio.sleep(1)
    
    logger.info("[BACKGROUND_JOBS] 🛑 Background jobs stopped")


class EmbeddingSyncJob:
    """Background job to keep face embedding in-memory cache in sync with MongoDB.

    Uses lightweight polling to detect new/updated embeddings and applies
    per-person updates to the FaceRecognitionService cache. This is a safe
    fallback when change-streams are not available in the Mongo deployment.
    """

    def __init__(self, poll_interval_seconds: int = 5):
        from datetime import datetime
        self.poll_interval = int(poll_interval_seconds)
        self._stop = False
        self._last_seen = {}  # school_id -> datetime
        self._root_db = get_saas_root_db()

    async def start_scheduled_job(self, interval_seconds: int = None):
        import asyncio
        from datetime import datetime

        if interval_seconds is None:
            interval_seconds = self.poll_interval

        logger.info(f"[EMBEDDING_SYNC] Starting embedding sync (poll interval={interval_seconds}s)")

        while not self._stop:
            try:
                await self.sync_once()
            except Exception as e:
                logger.error(f"[EMBEDDING_SYNC] Sync error: {e}")
            try:
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                break

        logger.info("[EMBEDDING_SYNC] Stopped embedding sync job")

    async def sync_once(self):
        from datetime import datetime
        import numpy as np
        from app.services.saas_db import get_school_database
        from app.services.face_service import FaceRecognitionService

        # fetch active schools
        schools = list(self._root_db.schools.find({}))

        for school in schools:
            try:
                school_id = school.get("school_id")
                db_name = school.get("database_name")
                if not school_id or not db_name:
                    continue

                last = self._last_seen.get(school_id)
                if not last:
                    # default: now (will only pick up future changes)
                    last = datetime.utcnow()

                # Connect to school database
                try:
                    school_db = get_school_database(db_name)
                except Exception as e:
                    logger.warning(f"[EMBEDDING_SYNC] Cannot connect to DB {db_name}: {e}")
                    continue

                face_service = FaceRecognitionService(school_db)

                # Query updated students
                try:
                    student_query = {"school_id": school_id, "embedding_generated_at": {"$gt": last}}
                    cursor = school_db.students.find(student_query)
                    for student in cursor:
                        # If embedding removed, remove from cache
                        pid = str(student.get("_id"))
                        if not student.get("face_embedding"):
                            face_service.remove_from_cache("student", pid)
                            logger.info(f"[EMBEDDING_SYNC] Removed student from cache: {pid}")
                            continue

                        try:
                            emb = np.array(student.get("face_embedding"), dtype=np.float32)
                        except Exception:
                            logger.warning(f"[EMBEDDING_SYNC] Invalid embedding for student {pid}")
                            continue

                        cache_data = {
                            "embedding": emb,
                            "name": student.get("full_name") or student.get("student_id"),
                            "has_image": bool(student.get("profile_image_blob") or student.get("profile_image_url")),
                            "student_id": student.get("student_id"),
                            "class_id": student.get("class_id"),
                            "section": student.get("section"),
                            "roll_number": student.get("roll_number"),
                            "school_id": school_id
                        }
                        face_service.refresh_cache_entry("student", pid, cache_data)
                        logger.info(f"[EMBEDDING_SYNC] Updated student cache: {pid}")
                except Exception as e:
                    logger.debug(f"[EMBEDDING_SYNC] Student query error for {school_id}: {e}")

                # Query updated teachers
                try:
                    teacher_query = {"school_id": school_id, "embedding_generated_at": {"$gt": last}}
                    cursor = school_db.teachers.find(teacher_query)
                    for teacher in cursor:
                        pid = str(teacher.get("_id"))
                        if not teacher.get("face_embedding"):
                            face_service.remove_from_cache("employee", pid)
                            logger.info(f"[EMBEDDING_SYNC] Removed teacher from cache: {pid}")
                            continue

                        try:
                            emb = np.array(teacher.get("face_embedding"), dtype=np.float32)
                        except Exception:
                            logger.warning(f"[EMBEDDING_SYNC] Invalid embedding for teacher {pid}")
                            continue

                        cache_data = {
                            "embedding": emb,
                            "name": teacher.get("name") or teacher.get("teacher_id"),
                            "has_image": bool(teacher.get("profile_image_blob") or teacher.get("profile_image_url")),
                            "teacher_id": teacher.get("teacher_id"),
                            "email": teacher.get("email"),
                            "school_id": school_id
                        }
                        face_service.refresh_cache_entry("employee", pid, cache_data)
                        logger.info(f"[EMBEDDING_SYNC] Updated teacher cache: {pid}")
                except Exception as e:
                    logger.debug(f"[EMBEDDING_SYNC] Teacher query error for {school_id}: {e}")

                # Update last seen timestamp for this school
                self._last_seen[school_id] = datetime.utcnow()

            except Exception as e:
                logger.error(f"[EMBEDDING_SYNC] Unexpected error while processing school: {e}")

    def stop(self):
        self._stop = True
