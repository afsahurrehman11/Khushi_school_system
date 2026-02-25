"""
SaaS School Management Service
Handles school CRUD operations in the multi-tenant SaaS system
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
import uuid
import hashlib
import logging

from app.models.saas import (
    SaaSSchoolCreate, SaaSSchoolInDB, SaaSSchoolResponse,
    SaaSSchoolUpdate, SchoolPlan, SchoolStatus,
    UsageSnapshot, SaaSOverviewStats, SchoolStorageHistory,
    GlobalUserRole
)
from app.services.saas_db import (
    get_saas_root_db, get_school_database, generate_database_name,
    create_school_database, delete_school_database,
    get_database_stats, get_school_entity_counts,
    get_school_by_admin_email, get_school_by_id,
    generate_school_slug, create_global_user, get_global_user_by_email
)

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash password using SHA256 (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password


# ================= School CRUD Operations =================

def create_saas_school(school_data: SaaSSchoolCreate) -> Dict[str, Any]:
    """
    Create a new school in the SaaS system:
    1. Generate unique school_slug from school_name
    2. Generate database_name
    3. Create entry in saas_root_db.schools
    4. Create new MongoDB database for the school
    5. Create ADMIN user in saas_root_db.global_users
    
    Returns dict with school info and admin credentials for auto-login
    """
    root_db = get_saas_root_db()
    
    # Check if admin email already exists in global_users
    existing_user = get_global_user_by_email(school_data.admin_email)
    if existing_user:
        logger.warning(f"[SAAS] Admin email already exists in global_users: {school_data.admin_email}")
        raise ValueError(f"Email '{school_data.admin_email}' is already in use")
    
    # Check if school name already exists
    existing_name = root_db.schools.find_one({
        "school_name": {"$regex": f"^{school_data.school_name}$", "$options": "i"}
    })
    if existing_name:
        logger.warning(f"[SAAS] School name already exists: {school_data.school_name}")
        raise ValueError(f"School name '{school_data.school_name}' is already in use")
    
    # Generate unique identifiers
    school_id = str(uuid.uuid4())
    school_slug = generate_school_slug(school_data.school_name)
    database_name = generate_database_name(school_data.school_name)
    
    # Ensure database name is unique
    while root_db.schools.find_one({"database_name": database_name}):
        database_name = generate_database_name(school_data.school_name + "_" + str(uuid.uuid4())[:8])
    
    # Hash the password
    hashed_password = hash_password(school_data.admin_password)
    
    # Generate admin email - use provided or generate from admin_name@edu format
    admin_email = school_data.admin_email.lower().strip()
    
    now = datetime.utcnow()
    
    # Create school document
    school_doc = {
        "school_id": school_id,
        "school_name": school_data.school_name,
        "school_slug": school_slug,
        "database_name": database_name,
        "admin_email": admin_email,
        "hashed_password": hashed_password,
        "plan": school_data.plan.value,
        "status": SchoolStatus.ACTIVE.value,
        "email": school_data.email,
        "phone": school_data.phone,
        "address": school_data.address,
        "city": school_data.city,
        "state": school_data.state,
        "country": school_data.country,
        "postal_code": school_data.postal_code,
        "logo_url": school_data.logo_url,
        "created_at": now,
        "updated_at": now,
        "suspended_at": None,
        "deleted_at": None,
        "student_count": 0,
        "teacher_count": 0,
        "storage_bytes": 0,
        "last_stats_update": None,
    }
    
    # Insert school into saas_root_db.schools
    result = root_db.schools.insert_one(school_doc)
    school_doc["id"] = str(result.inserted_id)
    
    logger.info(f"[SAAS] Created school entry: {school_data.school_name} (Slug: {school_slug}, DB: {database_name})")
    
    # Create the actual database
    if not create_school_database(database_name):
        # Rollback - remove the school entry
        root_db.schools.delete_one({"_id": result.inserted_id})
        raise RuntimeError(f"Failed to create database for school: {school_data.school_name}")
    
    # Create ADMIN user in saas_root_db.global_users (NOT in school's database)
    admin_user_data = {
        "name": school_data.admin_name or f"{school_data.school_name} Admin",
        "email": admin_email,
        "password_hash": hashed_password,
        "role": GlobalUserRole.ADMIN.value,
        "school_id": school_id,
        "school_slug": school_slug,
        "database_name": database_name,
        "is_active": True,
    }
    
    admin_user = create_global_user(admin_user_data)
    if not admin_user:
        # Rollback - remove school and database
        root_db.schools.delete_one({"_id": result.inserted_id})
        delete_school_database(database_name)
        raise RuntimeError(f"Failed to create admin user for school: {school_data.school_name}")
    
    # Also create a school info entry in the school's own database (for local reference)
    school_db = get_school_database(database_name)
    school_info = {
        "name": school_data.school_name.lower(),
        "display_name": school_data.school_name,
        "school_slug": school_slug,
        "email": school_data.email,
        "phone": school_data.phone,
        "address": school_data.address,
        "city": school_data.city,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    school_db.schools.insert_one(school_info)
    
    logger.info(f"[SAAS] ✅ School fully provisioned: {school_data.school_name} (Admin: {admin_email})")
    
    # Return school info with admin user for auto-login
    return {
        "school": SaaSSchoolInDB(**school_doc),
        "admin_user": admin_user,
        "admin_password": school_data.admin_password,  # Return plain password for auto-login token generation
    }


def get_saas_school(school_id: str) -> Optional[SaaSSchoolInDB]:
    """Get a school by its school_id"""
    school = get_school_by_id(school_id)
    if school:
        return SaaSSchoolInDB(**school)
    return None


def get_all_saas_schools(
    status: Optional[SchoolStatus] = None,
    plan: Optional[SchoolPlan] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
) -> List[SaaSSchoolInDB]:
    """Get all schools with optional filtering"""
    root_db = get_saas_root_db()
    
    query = {}
    if status:
        query["status"] = status.value
    if plan:
        query["plan"] = plan.value
    if search:
        query["$or"] = [
            {"school_name": {"$regex": search, "$options": "i"}},
            {"admin_email": {"$regex": search, "$options": "i"}},
        ]
    
    cursor = root_db.schools.find(query).skip(skip).limit(limit).sort("created_at", -1)
    
    schools = []
    for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        schools.append(SaaSSchoolInDB(**doc))
    
    return schools


def get_saas_school_count(status: Optional[SchoolStatus] = None) -> int:
    """Get total count of schools"""
    root_db = get_saas_root_db()
    query = {}
    if status:
        query["status"] = status.value
    return root_db.schools.count_documents(query)


def update_saas_school(school_id: str, update_data: SaaSSchoolUpdate) -> Optional[SaaSSchoolInDB]:
    """Update school information"""
    root_db = get_saas_root_db()
    
    update_dict = update_data.dict(exclude_unset=True)
    if not update_dict:
        return get_saas_school(school_id)
    
    update_dict["updated_at"] = datetime.utcnow()
    
    result = root_db.schools.find_one_and_update(
        {"school_id": school_id},
        {"$set": update_dict},
        return_document=True
    )
    
    if result:
        result["id"] = str(result.pop("_id"))
        logger.info(f"[SAAS] Updated school: {school_id}")
        return SaaSSchoolInDB(**result)
    
    return None


def suspend_saas_school(school_id: str, reason: Optional[str] = None) -> Optional[SaaSSchoolInDB]:
    """Suspend a school (blocks login and access)"""
    root_db = get_saas_root_db()
    
    now = datetime.utcnow()
    result = root_db.schools.find_one_and_update(
        {"school_id": school_id, "status": {"$ne": SchoolStatus.DELETED.value}},
        {
            "$set": {
                "status": SchoolStatus.SUSPENDED.value,
                "suspended_at": now,
                "updated_at": now,
                "suspension_reason": reason,
            }
        },
        return_document=True
    )
    
    if result:
        result["id"] = str(result.pop("_id"))
        logger.info(f"[SAAS] ⚠️ Suspended school: {school_id}")
        return SaaSSchoolInDB(**result)
    
    return None


def reactivate_saas_school(school_id: str) -> Optional[SaaSSchoolInDB]:
    """Reactivate a suspended school"""
    root_db = get_saas_root_db()
    
    result = root_db.schools.find_one_and_update(
        {"school_id": school_id, "status": SchoolStatus.SUSPENDED.value},
        {
            "$set": {
                "status": SchoolStatus.ACTIVE.value,
                "suspended_at": None,
                "suspension_reason": None,
                "updated_at": datetime.utcnow(),
            }
        },
        return_document=True
    )
    
    if result:
        result["id"] = str(result.pop("_id"))
        logger.info(f"[SAAS] ✅ Reactivated school: {school_id}")
        return SaaSSchoolInDB(**result)
    
    return None


def delete_saas_school(school_id: str, hard_delete: bool = False) -> bool:
    """
    Delete a school.
    soft_delete: Mark as deleted (default)
    hard_delete: Actually remove the database and all related data
    """
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return False
    
    if hard_delete:
        database_name = school.get("database_name")
        
        # 1. Delete all global_users associated with this school
        deleted_users = root_db.global_users.delete_many({"school_id": school_id})
        logger.info(f"[SAAS] 🗑️ Deleted {deleted_users.deleted_count} global_users for school: {school_id}")
        
        # 2. Delete all payment_records for this school
        deleted_payments = root_db.payment_records.delete_many({"school_id": school_id})
        logger.info(f"[SAAS] 🗑️ Deleted {deleted_payments.deleted_count} payment_records for school: {school_id}")
        
        # 3. Delete all usage_snapshots for this school
        deleted_snapshots = root_db.usage_snapshots.delete_many({"school_id": school_id})
        logger.info(f"[SAAS] 🗑️ Deleted {deleted_snapshots.deleted_count} usage_snapshots for school: {school_id}")
        
        # 4. Delete all invoices for this school
        deleted_invoices = root_db.invoices.delete_many({"school_id": school_id})
        logger.info(f"[SAAS] 🗑️ Deleted {deleted_invoices.deleted_count} invoices for school: {school_id}")
        
        # 5. Delete the actual school database
        if database_name:
            delete_school_database(database_name)
            logger.info(f"[SAAS] 🗑️ Dropped database: {database_name}")
        
        # 6. Remove school entry from saas_root_db
        root_db.schools.delete_one({"school_id": school_id})
        logger.info(f"[SAAS] 🗑️ Hard deleted school: {school_id}")
    else:
        # Soft delete
        root_db.schools.update_one(
            {"school_id": school_id},
            {
                "$set": {
                    "status": SchoolStatus.DELETED.value,
                    "deleted_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        logger.info(f"[SAAS] 🗑️ Soft deleted school: {school_id}")
    
    return True


def permanent_delete_school(school_id: str) -> dict:
    """
    Permanently delete a school and ALL associated data.
    This is irreversible and removes:
    - The school's MongoDB database
    - All global_users (admin + staff)
    - All payment_records
    - All usage_snapshots
    - All invoices
    - The school entry itself
    
    Returns a summary of what was deleted.
    """
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return None
    
    database_name = school.get("database_name")
    school_name = school.get("school_name")
    
    summary = {
        "school_id": school_id,
        "school_name": school_name,
        "database_name": database_name,
        "deleted_users": 0,
        "deleted_payments": 0,
        "deleted_snapshots": 0,
        "deleted_invoices": 0,
        "database_dropped": False,
    }
    
    # 1. Delete all global_users for this school
    result = root_db.global_users.delete_many({"school_id": school_id})
    summary["deleted_users"] = result.deleted_count
    
    # 2. Delete all payment_records
    result = root_db.payment_records.delete_many({"school_id": school_id})
    summary["deleted_payments"] = result.deleted_count
    
    # 3. Delete all usage_snapshots
    result = root_db.usage_snapshots.delete_many({"school_id": school_id})
    summary["deleted_snapshots"] = result.deleted_count
    
    # 4. Delete all invoices
    result = root_db.invoices.delete_many({"school_id": school_id})
    summary["deleted_invoices"] = result.deleted_count
    
    # 5. Drop the school database
    if database_name:
        try:
            delete_school_database(database_name)
            summary["database_dropped"] = True
            logger.info(f"[SAAS] 🗑️ Dropped database: {database_name}")
        except Exception as e:
            logger.error(f"[SAAS] Failed to drop database {database_name}: {e}")
            summary["database_dropped"] = False
    
    # 6. Delete school entry
    root_db.schools.delete_one({"school_id": school_id})
    
    logger.info(f"[SAAS] ✅ Permanently deleted school: {school_name} ({school_id})")
    return summary


def set_school_billing_day(school_id: str, billing_day: int) -> bool:
    """
    Set the billing day for a school.
    This is the day of the month when the school's payment is due.
    If auto_suspend_enabled and payment not received, school will be suspended.
    """
    if billing_day < 1 or billing_day > 28:
        raise ValueError("Billing day must be between 1 and 28")
    
    root_db = get_saas_root_db()
    
    # Calculate next payment due date
    now = datetime.utcnow()
    if now.day > billing_day:
        # Next month
        if now.month == 12:
            next_due = datetime(now.year + 1, 1, billing_day)
        else:
            next_due = datetime(now.year, now.month + 1, billing_day)
    else:
        next_due = datetime(now.year, now.month, billing_day)
    
    result = root_db.schools.update_one(
        {"school_id": school_id},
        {
            "$set": {
                "payment_due_day": billing_day,
                "auto_suspend_enabled": True,
                "next_payment_due": next_due,
                "updated_at": datetime.utcnow(),
            }
        }
    )
    
    if result.matched_count == 0:
        return False
    
    logger.info(f"[SAAS] 📅 Set billing day to {billing_day} for school: {school_id}")
    return True


def check_and_suspend_overdue_schools() -> List[str]:
    """
    Check all schools for overdue payments and suspend them.
    This should be called daily by a scheduled job.
    
    Returns list of school_ids that were suspended.
    """
    root_db = get_saas_root_db()
    now = datetime.utcnow()
    today_day = now.day
    
    suspended_schools = []
    
    # Find all active schools with auto_suspend_enabled and payment_due_day set
    schools = root_db.schools.find({
        "status": SchoolStatus.ACTIVE.value,
        "auto_suspend_enabled": True,
        "payment_due_day": {"$exists": True, "$ne": None}
    })
    
    for school in schools:
        billing_day = school.get("payment_due_day")
        grace_period = school.get("grace_period_days", 3)
        last_payment = school.get("last_payment_date")
        school_id = school.get("school_id")
        
        # Calculate if this school should be suspended
        # If today is past billing_day + grace_period and no payment this month
        
        # Check if payment was made this month
        payment_made_this_month = False
        if last_payment:
            if last_payment.year == now.year and last_payment.month == now.month:
                payment_made_this_month = True
        
        # Check if we're past the due date + grace period
        if payment_made_this_month:
            continue
        
        # Calculate days past due
        if today_day >= billing_day:
            days_past_due = today_day - billing_day
        else:
            # We haven't reached billing day yet this month
            continue
        
        if days_past_due > grace_period:
            # Suspend the school
            root_db.schools.update_one(
                {"school_id": school_id},
                {
                    "$set": {
                        "status": SchoolStatus.SUSPENDED.value,
                        "suspended_at": now,
                        "suspension_reason": f"Payment overdue - not received by day {billing_day} + {grace_period} day grace period",
                        "updated_at": now,
                    }
                }
            )
            suspended_schools.append(school_id)
            logger.warning(f"[BILLING] ⚠️ Auto-suspended school for non-payment: {school_id}")
    
    return suspended_schools


def reset_school_admin_password(school_id: str, new_password: str) -> bool:
    """
    Reset the admin password for a school.
    Updates the password in global_users (SINGLE SOURCE OF TRUTH).
    """
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return False
    
    hashed = hash_password(new_password)
    admin_email = school.get("admin_email")
    
    # Update in global_users (SINGLE SOURCE OF TRUTH)
    result = root_db.global_users.update_one(
        {"email": admin_email, "school_id": school_id},
        {
            "$set": {
                "password_hash": hashed,
                "updated_at": datetime.utcnow().isoformat(),
            }
        }
    )
    
    if result.matched_count == 0:
        # Try finding by just school_id and role=admin
        result = root_db.global_users.update_one(
            {"school_id": school_id, "role": "admin"},
            {
                "$set": {
                    "password_hash": hashed,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            }
        )
        if result.matched_count == 0:
            logger.warning(f"[SAAS] ⚠️ Admin user not found in global_users for school: {school_id}")
            return False
    
    logger.info(f"[SAAS] 🔑 Reset password for school admin: {school_id}")
    return True


# ================= Analytics & Stats Operations =================

def get_saas_overview_stats() -> SaaSOverviewStats:
    """Get overview statistics for the SaaS dashboard"""
    root_db = get_saas_root_db()
    
    # Count schools by status
    pipeline = [
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        }
    ]
    status_counts = {doc["_id"]: doc["count"] for doc in root_db.schools.aggregate(pipeline)}
    
    # Count schools by plan
    pipeline = [
        {"$match": {"status": {"$ne": SchoolStatus.DELETED.value}}},
        {
            "$group": {
                "_id": "$plan",
                "count": {"$sum": 1}
            }
        }
    ]
    plan_counts = {doc["_id"]: doc["count"] for doc in root_db.schools.aggregate(pipeline)}
    
    # Sum totals
    pipeline = [
        {"$match": {"status": {"$ne": SchoolStatus.DELETED.value}}},
        {
            "$group": {
                "_id": None,
                "total_students": {"$sum": "$student_count"},
                "total_teachers": {"$sum": "$teacher_count"},
                "total_storage": {"$sum": "$storage_bytes"},
            }
        }
    ]
    totals = list(root_db.schools.aggregate(pipeline))
    totals = totals[0] if totals else {}
    
    return SaaSOverviewStats(
        total_schools=sum(status_counts.values()),
        active_schools=status_counts.get(SchoolStatus.ACTIVE.value, 0),
        suspended_schools=status_counts.get(SchoolStatus.SUSPENDED.value, 0),
        total_students=totals.get("total_students", 0),
        total_teachers=totals.get("total_teachers", 0),
        total_storage_bytes=totals.get("total_storage", 0),
        trial_schools=plan_counts.get(SchoolPlan.TRIAL.value, 0),
        basic_schools=plan_counts.get(SchoolPlan.BASIC.value, 0),
        standard_schools=plan_counts.get(SchoolPlan.STANDARD.value, 0),
        premium_schools=plan_counts.get(SchoolPlan.PREMIUM.value, 0),
        enterprise_schools=plan_counts.get(SchoolPlan.ENTERPRISE.value, 0),
    )


def update_school_stats(school_id: str) -> Dict[str, Any]:
    """Update cached stats for a school"""
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return {}
    
    database_name = school.get("database_name")
    if not database_name:
        return {}
    
    # Get database stats
    db_stats = get_database_stats(database_name)
    entity_counts = get_school_entity_counts(database_name)
    
    now = datetime.utcnow()
    
    # Update school document
    root_db.schools.update_one(
        {"school_id": school_id},
        {
            "$set": {
                "storage_bytes": db_stats.get("storage_bytes", 0),
                "student_count": entity_counts.get("student_count", 0),
                "teacher_count": entity_counts.get("teacher_count", 0),
                "last_stats_update": now,
            }
        }
    )
    
    return {
        **db_stats,
        **entity_counts,
        "updated_at": now,
    }


def create_usage_snapshot(school_id: str) -> Optional[UsageSnapshot]:
    """Create a usage snapshot for a school"""
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return None
    
    database_name = school.get("database_name")
    if not database_name:
        return None
    
    db_stats = get_database_stats(database_name)
    entity_counts = get_school_entity_counts(database_name)
    
    now = datetime.utcnow()
    # Set date to midnight UTC for the current day
    snapshot_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    snapshot_doc = {
        "school_id": school_id,
        "database_name": database_name,
        "date": snapshot_date,
        "storage_bytes": db_stats.get("storage_bytes", 0),
        "data_size": db_stats.get("data_size", 0),
        "index_size": db_stats.get("index_size", 0),
        "object_count": db_stats.get("object_count", 0),
        "collection_count": db_stats.get("collection_count", 0),
        "student_count": entity_counts.get("student_count", 0),
        "teacher_count": entity_counts.get("teacher_count", 0),
        "user_count": entity_counts.get("user_count", 0),
        "created_at": now,
    }
    
    # Upsert - update if snapshot for today already exists
    result = root_db.usage_snapshots.update_one(
        {"school_id": school_id, "date": snapshot_date},
        {"$set": snapshot_doc},
        upsert=True
    )
    
    snapshot_doc["id"] = str(result.upserted_id) if result.upserted_id else None
    
    logger.info(f"[SAAS] 📊 Created usage snapshot for school: {school_id}")
    return UsageSnapshot(**snapshot_doc)


def get_school_storage_history(school_id: str, days: int = 30) -> SchoolStorageHistory:
    """Get storage usage history for a school"""
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return None
    
    from datetime import timedelta
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    snapshots = list(root_db.usage_snapshots.find(
        {"school_id": school_id, "date": {"$gte": cutoff_date}},
        {"date": 1, "storage_bytes": 1, "_id": 0}
    ).sort("date", 1))
    
    history = [
        {"date": s["date"].isoformat(), "storage_bytes": s.get("storage_bytes", 0)}
        for s in snapshots
    ]
    
    return SchoolStorageHistory(
        school_id=school_id,
        school_name=school.get("school_name", ""),
        history=history
    )


def get_all_storage_history(days: int = 30) -> List[Dict]:
    """Get storage history for all schools"""
    root_db = get_saas_root_db()
    
    from datetime import timedelta
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    pipeline = [
        {"$match": {"date": {"$gte": cutoff_date}}},
        {"$sort": {"date": 1}},
        {
            "$group": {
                "_id": "$school_id",
                "history": {
                    "$push": {
                        "date": "$date",
                        "storage_bytes": "$storage_bytes"
                    }
                }
            }
        }
    ]
    
    results = list(root_db.usage_snapshots.aggregate(pipeline))
    
    # Enrich with school names
    enriched = []
    for r in results:
        school = root_db.schools.find_one({"school_id": r["_id"]})
        if school:
            enriched.append({
                "school_id": r["_id"],
                "school_name": school.get("school_name", ""),
                "history": [
                    {"date": h["date"].isoformat(), "storage_bytes": h.get("storage_bytes", 0)}
                    for h in r["history"]
                ]
            })
    
    return enriched


# ================= Authentication Helpers =================

def authenticate_school_admin(email: str, password: str) -> Optional[Dict]:
    """
    Authenticate a school admin.
    Returns school info including database_name if successful.
    """
    school = get_school_by_admin_email(email)
    if not school:
        return None
    
    # Check status
    if school.get("status") == SchoolStatus.SUSPENDED.value:
        logger.warning(f"[SAAS] Login blocked - school suspended: {email}")
        raise ValueError("School is suspended. Contact administrator.")
    
    if school.get("status") == SchoolStatus.DELETED.value:
        logger.warning(f"[SAAS] Login blocked - school deleted: {email}")
        raise ValueError("School has been deleted.")
    
    # Verify password
    if not verify_password(password, school.get("hashed_password", "")):
        return None
    
    return school
