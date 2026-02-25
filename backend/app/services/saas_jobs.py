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
        for school in deleted_schools:
            school_id = school.get("school_id")
            try:
                # Hard delete the school
                delete_saas_school(school_id, hard_delete=True)
                removed_count += 1
                logger.info(f"[CLEANUP_JOB] 🗑️ Permanently removed school: {school_id}")
            except Exception as e:
                logger.error(f"[CLEANUP_JOB] ❌ Failed to remove school {school_id}: {e}")
        
        return removed_count
    
    async def run_cleanup(self) -> dict:
        """Run all cleanup tasks"""
        logger.info("[CLEANUP_JOB] Starting cleanup job")
        
        snapshots_removed = await self.cleanup_old_snapshots()
        schools_removed = await self.cleanup_deleted_schools()
        
        results = {
            "snapshots_removed": snapshots_removed,
            "schools_removed": schools_removed,
            "run_at": datetime.utcnow().isoformat()
        }
        
        logger.info(f"[CLEANUP_JOB] Completed: {snapshots_removed} snapshots, {schools_removed} schools removed")
        
        return results
    
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
    asyncio.create_task(snapshot_job.start_scheduled_job(interval_hours=24))
    asyncio.create_task(cleanup_job.start_scheduled_job(interval_hours=48))
    asyncio.create_task(billing_job.start_scheduled_job(interval_hours=24))
    
    logger.info("[BACKGROUND_JOBS] ✅ Background jobs started")


async def stop_background_jobs():
    """Stop all background jobs (called from app shutdown)"""
    if _snapshot_job:
        _snapshot_job.stop()
    if _cleanup_job:
        _cleanup_job.stop()
    if _billing_job:
        _billing_job.stop()
    
    # Give jobs time to stop gracefully
    await asyncio.sleep(1)
    
    logger.info("[BACKGROUND_JOBS] 🛑 Background jobs stopped")
