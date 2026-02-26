"""
SaaS Management Router
API endpoints for root users to manage the multi-tenant SaaS system
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from typing import List, Optional
from datetime import datetime, timedelta
import logging

from app.models.saas import (
    SaaSSchoolCreate, SaaSSchoolInDB, SaaSSchoolResponse, SaaSSchoolUpdate,
    SaaSSchoolSuspend, SaaSPasswordReset, SchoolPlan, SchoolStatus,
    SaaSOverviewStats, SchoolStorageHistory, UsageSnapshot,
    GlobalUserRole, StaffCreate, SaaSSchoolPaymentSettings, SaaSSchoolRecordPayment
)
from app.services.saas_service import (
    create_saas_school, get_saas_school, get_all_saas_schools,
    get_saas_school_count, update_saas_school, suspend_saas_school,
    reactivate_saas_school, delete_saas_school, reset_school_admin_password,
    get_saas_overview_stats, update_school_stats, create_usage_snapshot,
    get_school_storage_history, get_all_storage_history,
    hash_password, permanent_delete_school, set_school_billing_day,
    check_and_suspend_overdue_schools
)
from app.services.saas_db import (
    get_saas_root_db, get_database_stats, get_school_entity_counts,
    create_global_user, get_global_user_by_email, get_global_users_by_school
)
from app.dependencies.auth import get_current_root, get_current_admin, create_access_token
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ================= School Management Endpoints =================

@router.post("/schools", tags=["SaaS Management"])
async def create_school(
    school_data: SaaSSchoolCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_root)
):
    """
    Create a new school with its own database.
    
    - Creates entry in saas_root_db.schools
    - Auto-creates a new MongoDB database for the school
    - Creates admin user in saas_root_db.global_users
    - Returns auth token for admin auto-login (no redirect loop!)
    - Returns admin_password so root can share with school admin
    """
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Creating school: {school_data.school_name}")
        
        # Create school and admin user
        result = create_saas_school(school_data)
        school = result["school"]
        admin_user = result["admin_user"]
        admin_password = result["admin_password"]  # Plain text password for display
        
        # Schedule initial stats update
        background_tasks.add_task(update_school_stats, school.school_id)
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ School created: {school.school_name} (DB: {school.database_name})")
        
        # Generate JWT for admin auto-login
        token_data = {
            "sub": admin_user.get("email"),
            "user_id": admin_user.get("id"),
            "role": "Admin",
            "database_name": admin_user.get("database_name"),
            "school_slug": admin_user.get("school_slug"),
            "school_id": admin_user.get("school_id"),
        }
        
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(
            data=token_data,
            expires_delta=access_token_expires
        )
        
        # Return school info with admin auth for auto-login and password for display
        return {
            "school": {
                "id": school.id,
                "school_id": school.school_id,
                "school_name": school.school_name,
                "school_slug": school.school_slug,
                "database_name": school.database_name,
                "admin_email": school.admin_email,
                "plan": school.plan,
                "status": school.status,
                "email": school.email,
                "phone": school.phone,
                "city": school.city,
                "created_at": school.created_at,
                "student_count": school.student_count,
                "teacher_count": school.teacher_count,
                "storage_bytes": school.storage_bytes,
            },
            "admin_auth": {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": admin_user.get("id"),
                    "email": admin_user.get("email"),
                    "name": admin_user.get("name"),
                    "role": "Admin",
                    "school_id": admin_user.get("school_id"),
                    "school_slug": admin_user.get("school_slug"),
                    "database_name": admin_user.get("database_name"),
                    "created_at": admin_user.get("created_at"),
                    "is_active": admin_user.get("is_active", True),
                }
            },
            "admin_password": admin_password  # Plain text password - show to root ONCE
        }
        
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
                {
                    "id": s.id,
                    "school_id": s.school_id,
                    "school_name": s.school_name,
                    "school_slug": getattr(s, 'school_slug', ''),
                    "database_name": s.database_name,
                    "admin_email": s.admin_email,
                    "plan": s.plan,
                    "status": s.status,
                    "email": s.email,
                    "phone": s.phone,
                    "city": s.city,
                    "created_at": s.created_at,
                    "student_count": s.student_count,
                    "teacher_count": s.teacher_count,
                    "storage_bytes": s.storage_bytes,
                } for s in schools
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }
        
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to list schools: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools/{school_id}", tags=["SaaS Management"])
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
        
        return {
            "id": school.id,
            "school_id": school.school_id,
            "school_name": school.school_name,
            "school_slug": getattr(school, 'school_slug', ''),
            "database_name": school.database_name,
            "admin_email": school.admin_email,
            "plan": school.plan,
            "status": school.status,
            "email": school.email,
            "phone": school.phone,
            "city": school.city,
            "created_at": school.created_at,
            "student_count": school.student_count,
            "teacher_count": school.teacher_count,
            "storage_bytes": school.storage_bytes,
        }
        
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
            school_slug=school.school_slug,
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
            school_slug=school.school_slug,
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
            school_slug=school.school_slug,
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


@router.delete("/schools/{school_id}/permanent", tags=["SaaS Management"])
async def permanent_delete_school_endpoint(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """
    PERMANENTLY DELETE a school and ALL its data.
    
    This is IRREVERSIBLE and will:
    - Drop the school's MongoDB database
    - Delete all admin and staff accounts (global_users)
    - Delete all payment records
    - Delete all usage snapshots
    - Delete all invoices
    - Remove the school entry from saas_root_db
    
    Use with extreme caution!
    """
    try:
        result = permanent_delete_school(school_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.warning(f"[ROOT:{current_user.get('email')}] ⚠️🗑️ PERMANENTLY DELETED school: {result['school_name']} ({school_id})")
        
        return {
            "message": "School permanently deleted",
            "summary": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to permanently delete school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schools/{school_id}/temporary-suspend", tags=["SaaS Management"])
async def temporary_suspend_school(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """
    Temporarily suspend a school.
    
    This blocks all logins for the school (admin and all staff).
    The school can be reactivated later using the /reactivate endpoint.
    """
    try:
        school = suspend_saas_school(school_id, reason="Temporarily suspended by root admin")
        
        if not school:
            raise HTTPException(status_code=404, detail="School not found or already suspended/deleted")
        
        logger.info(f"[ROOT:{current_user.get('email')}] ⏸️ Temporarily suspended school: {school_id}")
        
        return {
            "message": "School temporarily suspended. All logins are blocked.",
            "school_id": school_id,
            "school_name": school.school_name,
            "status": school.status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to suspend school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/schools/{school_id}/billing-day", tags=["SaaS Management"])
async def set_billing_day(
    school_id: str,
    billing_day: int = Query(..., ge=1, le=28, description="Day of month (1-28) for billing"),
    current_user: dict = Depends(get_current_root)
):
    """
    Set the billing day for automatic payment suspension.
    
    If payment is not recorded by the billing_day + grace_period,
    the school will be automatically suspended.
    
    - billing_day: Day of month (1-28) when payment is due
    - Auto-suspension is enabled when billing day is set
    """
    try:
        success = set_school_billing_day(school_id, billing_day)
        
        if not success:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] 📅 Set billing day {billing_day} for school: {school_id}")
        
        return {
            "message": f"Billing day set to {billing_day}. Auto-suspension enabled.",
            "school_id": school_id,
            "billing_day": billing_day,
            "auto_suspend_enabled": True
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to set billing day: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/billing/check-overdue", tags=["SaaS Management"])
async def trigger_overdue_check(
    current_user: dict = Depends(get_current_root)
):
    """
    Manually trigger overdue payment check.
    
    This will suspend all schools that:
    - Have auto_suspend_enabled = true
    - Have a billing_day set
    - Haven't made payment this month
    - Are past the billing_day + grace_period
    
    Normally this is run automatically by a scheduled job.
    """
    try:
        suspended = check_and_suspend_overdue_schools()
        
        logger.info(f"[ROOT:{current_user.get('email')}] 🔍 Overdue check completed. Suspended: {len(suspended)} schools")
        
        return {
            "message": f"Overdue check completed",
            "suspended_count": len(suspended),
            "suspended_schools": suspended
        }
        
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to check overdue: {str(e)}")
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


@router.patch("/schools/{school_id}/payment-settings", tags=["SaaS Management"])
async def update_school_payment_settings(
    school_id: str,
    payment_settings: "SaaSSchoolPaymentSettings",
    current_user: dict = Depends(get_current_root)
):
    """
    Update payment/suspension settings for a school.
    
    - payment_due_day: Day of month (1-28) when payment is expected
    - auto_suspend_enabled: Whether to auto-suspend after grace period
    - grace_period_days: Days after due date before auto-suspend (0-30)
    - next_payment_due: Specific date for next payment due
    """
    from app.models.saas import SaaSSchoolPaymentSettings
    try:
        root_db = get_saas_root_db()
        
        # Build update document
        updates = {"updated_at": datetime.utcnow()}
        
        if payment_settings.payment_due_day is not None:
            updates["payment_due_day"] = payment_settings.payment_due_day
            # Auto-calculate next payment due date
            today = datetime.utcnow()
            day = payment_settings.payment_due_day
            if today.day > day:
                # Next month
                if today.month == 12:
                    next_due = datetime(today.year + 1, 1, day)
                else:
                    next_due = datetime(today.year, today.month + 1, day)
            else:
                next_due = datetime(today.year, today.month, day)
            updates["next_payment_due"] = next_due
            
        if payment_settings.auto_suspend_enabled is not None:
            updates["auto_suspend_enabled"] = payment_settings.auto_suspend_enabled
            
        if payment_settings.grace_period_days is not None:
            updates["grace_period_days"] = payment_settings.grace_period_days
            
        if payment_settings.next_payment_due is not None:
            updates["next_payment_due"] = payment_settings.next_payment_due
        
        result = root_db.schools.update_one(
            {"school_id": school_id},
            {"$set": updates}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="School not found")
        
        logger.info(f"[ROOT:{current_user.get('email')}] 📅 Updated payment settings for school: {school_id}")
        
        # Return updated school
        school = root_db.schools.find_one({"school_id": school_id})
        school["id"] = str(school["_id"])
        
        return {
            "message": "Payment settings updated",
            "school_id": school_id,
            "payment_due_day": school.get("payment_due_day"),
            "auto_suspend_enabled": school.get("auto_suspend_enabled", False),
            "grace_period_days": school.get("grace_period_days", 3),
            "next_payment_due": school.get("next_payment_due"),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to update payment settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schools/{school_id}/record-payment", tags=["SaaS Management"])
async def record_school_payment(
    school_id: str,
    payment_data: "SaaSSchoolRecordPayment",
    current_user: dict = Depends(get_current_root)
):
    """
    Record a payment received from a school.
    This will:
    - Update last_payment_date
    - Calculate next_payment_due based on payment_due_day
    - Reactivate the school if it was suspended for non-payment
    """
    from app.models.saas import SaaSSchoolRecordPayment
    try:
        root_db = get_saas_root_db()
        
        school = root_db.schools.find_one({"school_id": school_id})
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        
        payment_date = payment_data.payment_date or datetime.utcnow()
        payment_due_day = school.get("payment_due_day", 1)
        
        # Calculate next payment due
        if payment_date.day > payment_due_day:
            if payment_date.month == 12:
                next_due = datetime(payment_date.year + 1, 1, payment_due_day)
            else:
                next_due = datetime(payment_date.year, payment_date.month + 1, payment_due_day)
        else:
            next_due = datetime(payment_date.year, payment_date.month, payment_due_day)
        
        updates = {
            "last_payment_date": payment_date,
            "next_payment_due": next_due,
            "updated_at": datetime.utcnow(),
        }
        
        # If suspended for non-payment, reactivate
        if school.get("status") == SchoolStatus.SUSPENDED.value:
            if school.get("suspension_reason", "").lower().find("payment") != -1:
                updates["status"] = SchoolStatus.ACTIVE.value
                updates["suspended_at"] = None
                updates["suspension_reason"] = None
                logger.info(f"[BILLING] Auto-reactivated school {school_id} after payment")
        
        root_db.schools.update_one(
            {"school_id": school_id},
            {"$set": updates}
        )
        
        # Log payment record
        root_db.payment_records.insert_one({
            "school_id": school_id,
            "school_name": school.get("school_name"),
            "amount": payment_data.amount,
            "payment_date": payment_date,
            "recorded_by": current_user.get("email"),
            "notes": payment_data.notes,
            "created_at": datetime.utcnow(),
        })
        
        logger.info(f"[ROOT:{current_user.get('email')}] 💰 Recorded payment ${payment_data.amount} for school: {school_id}")
        
        return {
            "message": "Payment recorded successfully",
            "school_id": school_id,
            "amount": payment_data.amount,
            "payment_date": payment_date,
            "next_payment_due": next_due,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to record payment: {str(e)}")
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


# ================= Staff Management Endpoints (Admin-only) =================

@router.post("/staff", tags=["Staff Management"])
async def create_staff_user(
    staff_data: StaffCreate,
    current_user: dict = Depends(get_current_admin)
):
    """
    Create a new staff user for the current admin's school.
    
    Email format: <email_prefix>@<school_slug>
    Staff users are created in saas_root_db.global_users.
    """
    try:
        # Get school context from current user
        school_id = current_user.get("school_id")
        school_slug = current_user.get("school_slug")
        database_name = current_user.get("database_name")
        
        if not school_id or not school_slug or not database_name:
            logger.warning(f"[ADMIN:{current_user.get('email')}] Missing school context for staff creation")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School context required to create staff"
            )
        
        # Generate staff email: prefix@school_slug
        staff_email = f"{staff_data.email_prefix}@{school_slug}"
        
        # Check if email already exists
        if get_global_user_by_email(staff_email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{staff_email}' is already in use"
            )
        
        # Create staff user in global_users
        staff_user_data = {
            "name": staff_data.name,
            "email": staff_email,
            "password_hash": hash_password(staff_data.password),
            "role": GlobalUserRole.STAFF.value,
            "school_id": school_id,
            "school_slug": school_slug,
            "database_name": database_name,
            "is_active": True,
        }
        
        staff_user = create_global_user(staff_user_data)
        if not staff_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create staff user"
            )
        
        logger.info(f"[ADMIN:{current_user.get('email')}] ✅ Created staff user: {staff_email}")
        
        return {
            "id": staff_user.get("id"),
            "name": staff_user.get("name"),
            "email": staff_user.get("email"),
            "role": "Staff",
            "school_id": school_id,
            "school_slug": school_slug,
            "database_name": database_name,
            "created_at": staff_user.get("created_at"),
            "is_active": True,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN:{current_user.get('email')}] ❌ Failed to create staff: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/staff", tags=["Staff Management"])
async def list_staff_users(
    current_user: dict = Depends(get_current_admin)
):
    """List all staff users for the current admin's school"""
    try:
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School context required"
            )
        
        staff_users = get_global_users_by_school(school_id)
        
        # Filter to only staff users
        staff_only = [
            {
                "id": u.get("id"),
                "name": u.get("name"),
                "email": u.get("email"),
                "role": u.get("role", "").capitalize(),
                "is_active": u.get("is_active", True),
                "created_at": u.get("created_at"),
            }
            for u in staff_users
            if u.get("role") == GlobalUserRole.STAFF.value
        ]
        
        logger.info(f"[ADMIN:{current_user.get('email')}] ✅ Retrieved {len(staff_only)} staff users")
        return {"items": staff_only, "total": len(staff_only)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN:{current_user.get('email')}] ❌ Failed to list staff: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
