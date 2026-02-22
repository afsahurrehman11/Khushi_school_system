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
    UsageSnapshot, SaaSOverviewStats, SchoolStorageHistory
)
from app.services.saas_db import (
    get_saas_root_db, get_school_database, generate_database_name,
    create_school_database, delete_school_database,
    get_database_stats, get_school_entity_counts,
    get_school_by_admin_email, get_school_by_id
)

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash password using SHA256 (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password


# ================= School CRUD Operations =================

def create_saas_school(school_data: SaaSSchoolCreate) -> SaaSSchoolInDB:
    """
    Create a new school in the SaaS system:
    1. Create entry in saas_root_db.schools
    2. Create new MongoDB database for the school
    3. Create admin user in the school's database
    """
    root_db = get_saas_root_db()
    
    # Check if admin email already exists
    existing = root_db.schools.find_one({"admin_email": school_data.admin_email.lower()})
    if existing:
        logger.warning(f"[SAAS] Admin email already exists: {school_data.admin_email}")
        raise ValueError(f"Admin email '{school_data.admin_email}' is already in use")
    
    # Check if school name already exists
    existing_name = root_db.schools.find_one({
        "school_name": {"$regex": f"^{school_data.school_name}$", "$options": "i"}
    })
    if existing_name:
        logger.warning(f"[SAAS] School name already exists: {school_data.school_name}")
        raise ValueError(f"School name '{school_data.school_name}' is already in use")
    
    # Generate unique identifiers
    school_id = str(uuid.uuid4())
    database_name = generate_database_name(school_data.school_name)
    
    # Ensure database name is unique
    while root_db.schools.find_one({"database_name": database_name}):
        database_name = generate_database_name(school_data.school_name + "_" + str(uuid.uuid4())[:8])
    
    # Hash the password
    hashed_password = hash_password(school_data.admin_password)
    
    now = datetime.utcnow()
    
    # Create school document
    school_doc = {
        "school_id": school_id,
        "school_name": school_data.school_name,
        "database_name": database_name,
        "admin_email": school_data.admin_email.lower(),
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
    
    # Insert into saas_root_db
    result = root_db.schools.insert_one(school_doc)
    school_doc["id"] = str(result.inserted_id)
    
    logger.info(f"[SAAS] Created school entry: {school_data.school_name} (DB: {database_name})")
    
    # Create the actual database
    if not create_school_database(database_name):
        # Rollback - remove the school entry
        root_db.schools.delete_one({"_id": result.inserted_id})
        raise RuntimeError(f"Failed to create database for school: {school_data.school_name}")
    
    # Create admin user in the school's database
    school_db = get_school_database(database_name)
    admin_user = {
        "email": school_data.admin_email.lower(),
        "name": school_data.admin_name,
        "password": school_data.admin_password,  # Plaintext for dev (use hash in prod)
        "role": "Admin",
        "school_id": school_id,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    school_db.users.insert_one(admin_user)
    
    # Also create a schools entry in the school's own database (for local reference)
    school_info = {
        "name": school_data.school_name.lower(),
        "display_name": school_data.school_name,
        "email": school_data.email,
        "phone": school_data.phone,
        "address": school_data.address,
        "city": school_data.city,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    school_db.schools.insert_one(school_info)
    
    logger.info(f"[SAAS] ✅ School fully provisioned: {school_data.school_name}")
    
    return SaaSSchoolInDB(**school_doc)


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
    hard_delete: Actually remove the database and entry
    """
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return False
    
    if hard_delete:
        # Delete the actual database
        database_name = school.get("database_name")
        if database_name:
            delete_school_database(database_name)
        
        # Remove from saas_root_db
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


def reset_school_admin_password(school_id: str, new_password: str) -> bool:
    """Reset the admin password for a school"""
    root_db = get_saas_root_db()
    
    school = root_db.schools.find_one({"school_id": school_id})
    if not school:
        return False
    
    hashed = hash_password(new_password)
    admin_email = school.get("admin_email")
    database_name = school.get("database_name")
    
    # Update in saas_root_db
    root_db.schools.update_one(
        {"school_id": school_id},
        {
            "$set": {
                "hashed_password": hashed,
                "updated_at": datetime.utcnow(),
            }
        }
    )
    
    # Update in school's database
    if database_name:
        school_db = get_school_database(database_name)
        school_db.users.update_one(
            {"email": admin_email},
            {"$set": {"password": new_password, "updated_at": datetime.utcnow()}}
        )
    
    logger.info(f"[SAAS] 🔑 Reset password for school: {school_id}")
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
