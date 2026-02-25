import logging
import runpy
from pathlib import Path
from datetime import datetime
from app.database import get_db
from app.services.saas_db import get_mongo_client, SAAS_ROOT_DB

logger = logging.getLogger(__name__)

# Collections that the application expects to exist. Add more if needed.
REQUIRED_COLLECTIONS = [
    "schools",
    "users",
    "students",
    "teachers",
    "classes",
    "subjects",
    "grades",
    "fees",
    "fee_categories",
    "student_challans",
    "payments",
    "import_logs",
    "cash_sessions",
    "class_fee_assignments",
    "notifications",
    "payment_methods",
    "attendance",
]


def ensure_global_users_collection():
    """
    Ensure the global_users collection exists in saas_root_db with proper indexes.
    This is the SINGLE SOURCE OF TRUTH for all user authentication.
    """
    try:
        client = get_mongo_client()
        root_db = client[SAAS_ROOT_DB]
        
        # Create collection if not exists
        if "global_users" not in root_db.list_collection_names():
            root_db.create_collection("global_users")
            logger.info("✅ Created global_users collection in saas_root_db")
        
        # Create indexes
        global_users = root_db.global_users
        
        # Unique index on email (critical for login)
        global_users.create_index("email", unique=True, background=True)
        # Index for school lookups
        global_users.create_index("school_id", background=True)
        # Index for role-based queries
        global_users.create_index("role", background=True)
        # Compound index for school + active status
        global_users.create_index([("school_id", 1), ("is_active", 1)], background=True)
        
        logger.info("✅ global_users indexes ensured")
        
        # Also ensure schools collection has school_slug index
        if "schools" in root_db.list_collection_names():
            root_db.schools.create_index("school_slug", unique=True, sparse=True, background=True)
            logger.info("✅ schools.school_slug index ensured")
            
    except Exception as e:
        logger.error(f"❌ Failed to setup global_users: {e}")
        # Don't raise - allow app to continue even if this fails


def ensure_collections_exist():
    """Ensure required collections exist in the configured database.

    - Creates missing collections using `create_collection` (idempotent if exists).
    - Executes `backend/scripts/create_indexes.py` if present to create indexes.
    Returns a dict with lists of created and existing collections.
    Raises on unexpected errors so startup can fail loudly.
    """
    db = get_db()
    existing = db.list_collection_names()
    created = []

    for name in REQUIRED_COLLECTIONS:
        if name not in existing:
            try:
                db.create_collection(name)
                created.append(name)
            except Exception as exc:
                # If creation fails for an existing-with-options or other reason, log and re-raise
                logger.error("❌ Failed to create collection %s: %s", name, exc)
                raise

    # Attempt to run index creation script (if present) so collections have expected indexes
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "create_indexes.py"
    # Run index creation only if enabled via settings
    from app.config import settings
    if settings.create_indexes:
        if script_path.exists():
            try:
                logger.info("🔧 Running index creation script")
                # run_path logs more details; keep our message concise
                runpy.run_path(str(script_path), run_name="__main__")
                logger.info("✅ Index creation completed")
            except Exception as exc:
                logger.error("❌ Index creation script failed: %s", exc)
                raise
        else:
            logger.debug("No index creation script found at %s", script_path)
    else:
        logger.info("⚠️ Skipping index creation (CREATE_INDEXES=false)")

    # Summarize created collections in a single concise message
    if created:
        logger.info("✅ Collections created: %s", created)
    else:
        logger.info("✅ All required collections already exist")

    # Ensure global_users collection exists in saas_root_db
    try:
        ensure_global_users_collection()
    except Exception:
        logger.warning("⚠️ ensure_global_users_collection failed; continuing startup")

    # Ensure default roles and permissions are present so Admin users can access academic data
    try:
        ensure_default_roles()
    except Exception:
        logger.warning("⚠️ ensure_default_roles failed; continuing startup")

    # Check if root user exists - WARN if not, but do NOT auto-create
    try:
        check_root_user_exists()
    except Exception:
        logger.warning("⚠️ check_root_user_exists failed; continuing startup")

    # NOTE: Auto-creation of schools/admins is DISABLED
    # Admin accounts must ONLY be created via root UI
    # Teacher seeding is also disabled in production

    return {"created": created, "existing": existing}


def ensure_default_roles():
    """Ensure essential roles (Admin, Accountant, Teacher, Root) exist with sensible permissions.

    This is idempotent and will upsert the Admin role to include common academic permissions
    so school administrators can view/manage classes, students, teachers, and subjects.
    """
    db = get_db()

    # Minimal set of school-admin permissions to enable class/teacher/student views
    admin_perms = [
        "students.read",
        "students.write",
        "students.manage",
        "teachers.read",
        "teachers.manage",
        "classes.read",
        "classes.manage",
        "subjects.read",
        "grades.read",
        "academics.view_classes",
        "academics.manage_attendance",
        "whatsapp.view",
        "whatsapp.send",
        "whatsapp.manage",
    ]

    existing = db.roles.find_one({"name": "Admin"})
    if not existing:
        role_doc = {
            "name": "Admin",
            "description": "School Administrator - manage users and academic data for their school",
            "permissions": admin_perms,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        try:
            db.roles.insert_one(role_doc)
            logger.info("✅ Created default Admin role with academic permissions")
        except Exception as e:
            logger.warning("⚠️ Failed to create Admin role: %s", e)
    else:
        # Make sure required perms are present (do not remove existing perms)
        current_perms = set(existing.get("permissions", []))
        missing = [p for p in admin_perms if p not in current_perms]
        if missing:
            try:
                db.roles.update_one({"name": "Admin"}, {"$addToSet": {"permissions": {"$each": missing}}})
                logger.info("✅ Added missing Admin permissions: %s", missing)
            except Exception as e:
                logger.warning("⚠️ Failed to update Admin role permissions: %s", e)

    # Teacher role - can view and manage attendance in their classes
    teacher_perms = [
        "students.read",
        "students.write",
        "classes.read",
        "academics.view_classes",
        "academics.manage_attendance",
    ]
    existing_teacher = db.roles.find_one({"name": "Teacher"})
    if not existing_teacher:
        role_doc = {
            "name": "Teacher",
            "description": "Teacher - manage Student attendance and view academic data",
            "permissions": teacher_perms,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        try:
            db.roles.insert_one(role_doc)
            logger.info("✅ Created default Teacher role with attendance permissions")
        except Exception as e:
            logger.warning("⚠️ Failed to create Teacher role: %s", e)
    else:
        # Make sure required perms are present
        current_perms = set(existing_teacher.get("permissions", []))
        missing = [p for p in teacher_perms if p not in current_perms]
        if missing:
            try:
                db.roles.update_one({"name": "Teacher"}, {"$addToSet": {"permissions": {"$each": missing}}})
                logger.info("✅ Added missing Teacher permissions: %s", missing)
            except Exception as e:
                logger.warning("⚠️ Failed to update Teacher role permissions: %s", e)


def ensure_default_teachers(min_count: int = 10):
    """Ensure each school has at least `min_count` teacher documents.

    Inserts simple teacher records with created_at/updated_at set so APIs
    and Pydantic serialization have the expected fields.
    """
    db = get_db()
    # iterate schools present in DB; if no `schools` collection, fall back to single default school from settings
    schools = list(db.schools.find()) if 'schools' in db.list_collection_names() else []
    if not schools:
        # fallback: try to inspect users to find a school id
        sample = db.users.find_one({"school_id": {"$exists": True}})
        if sample and sample.get('school_id'):
            schools = [{"_id": sample.get('school_id')}]

    for s in schools:
        school_id = str(s.get('_id'))
        try:
            count = db.teachers.count_documents({"school_id": school_id})
        except Exception:
            count = 0
        if count >= 1:
            logger.info(f"[SCHOOL:{school_id}] ✅ Found {count} teachers; skipping seeding")
            continue

        # create min_count simple teachers
        now = datetime.utcnow()
        docs = []
        for i in range(1, min_count + 1):
            docs.append({
                "school_id": school_id,
                "name": f"Teacher {i}",
                "email": f"teacher{i}@{school_id}.local",
                # avoid unique index collisions on cnic by providing synthetic unique values
                "cnic": f"SEED-{i}-{school_id}",
                "phone": None,
                "qualification": "B.Ed",
                "assigned_classes": [],
                "assigned_subjects": [],
                "created_at": now,
                "updated_at": now,
            })

        try:
            res = db.teachers.insert_many(docs)
            logger.info(f"[SCHOOL:{school_id}] ✅ Seeded {len(res.inserted_ids)} teacher profiles")
        except Exception as e:
            logger.warning(f"[SCHOOL:{school_id}] ⚠️ Failed to seed teachers: {e}")


def check_root_user_exists():
    """
    Check if root@edu user exists in saas_root_db.global_users.
    
    If root user does NOT exist, log a WARNING but do NOT auto-create.
    Root user must be created manually or via a one-time setup script.
    """
    try:
        client = get_mongo_client()
        root_db = client[SAAS_ROOT_DB]
        
        ROOT_EMAIL = "root@edu"
        
        root_user = root_db.global_users.find_one({"email": ROOT_EMAIL})
        
        if root_user:
            logger.info(f"✅ Root user exists: {ROOT_EMAIL}")
            return True
        else:
            logger.warning("=" * 60)
            logger.warning("⚠️  WARNING: Root user does not exist in saas_root_db")
            logger.warning(f"⚠️  Expected email: {ROOT_EMAIL}")
            logger.warning("⚠️  Please run the setup script to create the root user:")
            logger.warning("⚠️  python scripts/setup_root_user.py")
            logger.warning("=" * 60)
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to check root user: {e}")
        return False
