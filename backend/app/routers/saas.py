"""
SaaS Management Router
API endpoints for root users to manage the multi-tenant SaaS system
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from typing import List, Optional
from datetime import datetime
import logging

from app.models.saas import (
    SaaSSchoolCreate, SaaSSchoolInDB, SaaSSchoolResponse, SaaSSchoolUpdate,
    SaaSSchoolSuspend, SaaSPasswordReset, SchoolPlan, SchoolStatus,
    SaaSOverviewStats, SchoolStorageHistory, UsageSnapshot
)
from app.services.saas_service import (
    create_saas_school, get_saas_school, get_all_saas_schools,
    get_saas_school_count, update_saas_school, suspend_saas_school,
    reactivate_saas_school, delete_saas_school, reset_school_admin_password,
    get_saas_overview_stats, update_school_stats, create_usage_snapshot,
    get_school_storage_history, get_all_storage_history
)
from app.services.saas_db import (
    get_saas_root_db, get_database_stats, get_school_entity_counts
)
from app.dependencies.auth import get_current_root

logger = logging.getLogger(__name__)

router = APIRouter()


# ================= School Management Endpoints =================

@router.post("/schools", response_model=SaaSSchoolResponse, tags=["SaaS Management"])
async def create_school(
    school_data: SaaSSchoolCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_root)
):
    """
    Create a new school with its own database.
    
    - Creates entry in saas_root_db.schools
    - Auto-creates a new MongoDB database for the school
    - Creates admin user with provided credentials in the school database
    """
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Creating school: {school_data.school_name}")
        
        school = create_saas_school(school_data)
        
        # Schedule initial stats update
        background_tasks.add_task(update_school_stats, school.school_id)
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ School created: {school.school_name} (DB: {school.database_name})")
        
        return SaaSSchoolResponse(
            id=school.id,
            school_id=school.school_id,
            school_name=school.school_name,
            database_name=school.database_name,
            admin_email=school.admin_email,
            plan=school.plan,
            status=school.status,
            email=school.email,
            phone=school.phone,
            city=school.city,
            created_at=school.created_at,
            student_count=school.student_count,
            teacher_count=school.teacher_count,
            storage_bytes=school.storage_bytes,
        )
        
    except ValueError as e:
        logger.warning(f"[ROOT:{current_user.get('email')}] School creation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to create school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools", tags=["SaaS Management"])
async def list_schools(
    status: Optional[SchoolStatus] = None,
    plan: Optional[SchoolPlan] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_root)
):
    """List all schools with optional filtering"""
    try:
        schools = get_all_saas_schools(status=status, plan=plan, search=search, skip=skip, limit=limit)
        total = get_saas_school_count(status=status)
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved {len(schools)} schools")
        
        return {
            "items": [
                SaaSSchoolResponse(
                    id=s.id,
                    school_id=s.school_id,
                    school_name=s.school_name,
                    database_name=s.database_name,
                    admin_email=s.admin_email,
                    plan=s.plan,
                    status=s.status,
                    email=s.email,
                    phone=s.phone,
                    city=s.city,
                    created_at=s.created_at,
                    student_count=s.student_count,
                    teacher_count=s.teacher_count,
                    storage_bytes=s.storage_bytes,
                ) for s in schools
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }
        
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to list schools: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools/{school_id}", response_model=SaaSSchoolResponse, tags=["SaaS Management"])
async def get_school_details(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Get detailed information about a specific school"""
    try:
        school = get_saas_school(school_id)
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved school: {school_id}")
        
        return SaaSSchoolResponse(
            id=school.id,
            school_id=school.school_id,
            school_name=school.school_name,
            database_name=school.database_name,
            admin_email=school.admin_email,
            plan=school.plan,
            status=school.status,
            email=school.email,
            phone=school.phone,
            city=school.city,
            created_at=school.created_at,
            student_count=school.student_count,
            teacher_count=school.teacher_count,
            storage_bytes=school.storage_bytes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to get school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/schools/{school_id}", response_model=SaaSSchoolResponse, tags=["SaaS Management"])
async def update_school(
    school_id: str,
    update_data: SaaSSchoolUpdate,
    current_user: dict = Depends(get_current_root)
):
    """Update school information"""
    try:
        school = update_saas_school(school_id, update_data)
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Updated school: {school_id}")
        
        return SaaSSchoolResponse(
            id=school.id,
            school_id=school.school_id,
            school_name=school.school_name,
            database_name=school.database_name,
            admin_email=school.admin_email,
            plan=school.plan,
            status=school.status,
            email=school.email,
            phone=school.phone,
            city=school.city,
            created_at=school.created_at,
            student_count=school.student_count,
            teacher_count=school.teacher_count,
            storage_bytes=school.storage_bytes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to update school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schools/{school_id}/suspend", response_model=SaaSSchoolResponse, tags=["SaaS Management"])
async def suspend_school(
    school_id: str,
    suspend_data: SaaSSchoolSuspend = None,
    current_user: dict = Depends(get_current_root)
):
    """Suspend a school (blocks login and access immediately)"""
    try:
        reason = suspend_data.reason if suspend_data else None
        school = suspend_saas_school(school_id, reason)
        
        if not school:
            raise HTTPException(status_code=404, detail="School not found or already deleted")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ⚠️ Suspended school: {school_id}")
        
        return SaaSSchoolResponse(
            id=school.id,
            school_id=school.school_id,
            school_name=school.school_name,
            database_name=school.database_name,
            admin_email=school.admin_email,
            plan=school.plan,
            status=school.status,
            email=school.email,
            phone=school.phone,
            city=school.city,
            created_at=school.created_at,
            student_count=school.student_count,
            teacher_count=school.teacher_count,
            storage_bytes=school.storage_bytes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to suspend school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schools/{school_id}/reactivate", response_model=SaaSSchoolResponse, tags=["SaaS Management"])
async def reactivate_school(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Reactivate a suspended school"""
    try:
        school = reactivate_saas_school(school_id)
        
        if not school:
            raise HTTPException(status_code=404, detail="School not found or not suspended")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Reactivated school: {school_id}")
        
        return SaaSSchoolResponse(
            id=school.id,
            school_id=school.school_id,
            school_name=school.school_name,
            database_name=school.database_name,
            admin_email=school.admin_email,
            plan=school.plan,
            status=school.status,
            email=school.email,
            phone=school.phone,
            city=school.city,
            created_at=school.created_at,
            student_count=school.student_count,
            teacher_count=school.teacher_count,
            storage_bytes=school.storage_bytes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to reactivate school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/schools/{school_id}", tags=["SaaS Management"])
async def delete_school(
    school_id: str,
    hard_delete: bool = Query(False, description="If true, permanently deletes the database"),
    current_user: dict = Depends(get_current_root)
):
    """
    Delete a school.
    - soft delete (default): Marks as deleted, keeps data
    - hard delete: Permanently removes database (irreversible!)
    """
    try:
        success = delete_saas_school(school_id, hard_delete=hard_delete)
        
        if not success:
            raise HTTPException(status_code=404, detail="School not found")
        
        delete_type = "hard deleted" if hard_delete else "soft deleted"
        logger.info(f"[ROOT:{current_user.get('email')}] 🗑️ School {delete_type}: {school_id}")
        
        return {"message": f"School {delete_type} successfully", "school_id": school_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to delete school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schools/{school_id}/reset-password", tags=["SaaS Management"])
async def reset_admin_password(
    school_id: str,
    password_data: SaaSPasswordReset,
    current_user: dict = Depends(get_current_root)
):
    """Reset the admin password for a school"""
    try:
        success = reset_school_admin_password(school_id, password_data.new_password)
        
        if not success:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] 🔑 Reset password for school: {school_id}")
        
        return {"message": "Password reset successfully", "school_id": school_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to reset password: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Analytics Endpoints =================

@router.get("/analytics/overview", response_model=SaaSOverviewStats, tags=["SaaS Analytics"])
async def get_overview_stats(
    current_user: dict = Depends(get_current_root)
):
    """Get overview statistics for the SaaS dashboard"""
    try:
        stats = get_saas_overview_stats()
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved overview stats")
        return stats
        
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to get overview stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/storage-history", tags=["SaaS Analytics"])
async def get_storage_history(
    school_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_root)
):
    """Get storage usage history for schools"""
    try:
        if school_id:
            history = get_school_storage_history(school_id, days)
            if not history:
                raise HTTPException(status_code=404, detail="School not found")
            return history
        else:
            return get_all_storage_history(days)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to get storage history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analytics/refresh-stats/{school_id}", tags=["SaaS Analytics"])
async def refresh_school_stats(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Manually refresh statistics for a school"""
    try:
        stats = update_school_stats(school_id)
        if not stats:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Refreshed stats for school: {school_id}")
        return stats
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to refresh stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analytics/snapshot/{school_id}", tags=["SaaS Analytics"])
async def create_school_snapshot(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Create a usage snapshot for a school"""
    try:
        snapshot = create_usage_snapshot(school_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Created snapshot for school: {school_id}")
        return snapshot
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to create snapshot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools/{school_id}/database-stats", tags=["SaaS Management"])
async def get_school_database_stats(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Get detailed database statistics for a school"""
    try:
        school = get_saas_school(school_id)
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        
        db_stats = get_database_stats(school.database_name)
        entity_counts = get_school_entity_counts(school.database_name)
        
        return {
            "school_id": school_id,
            "school_name": school.school_name,
            "database_name": school.database_name,
            **db_stats,
            **entity_counts,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to get database stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
