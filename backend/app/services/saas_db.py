"""
SaaS Database Service
Handles multi-tenant database operations for the SaaS system
"""

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConfigurationError
from typing import Optional, Dict, Any, List
import logging
import os
import re
from datetime import datetime
from bson import ObjectId
from app.config import settings
from app.utils.mongo_uri_patch import patch_mongo_uri

logger = logging.getLogger(__name__)

# Root SaaS database name
SAAS_ROOT_DB_NAME = "saas_root_db"
SAAS_ROOT_DB = SAAS_ROOT_DB_NAME  # Alias for export

# Lazy client initialization
_client: Optional[MongoClient] = None
_db_cache: Dict[str, Database] = {}


def _create_client(uri: str) -> MongoClient:
    """Create MongoDB client with appropriate settings"""
    from urllib.parse import urlparse, parse_qs

    uri_lower = uri.lower() if isinstance(uri, str) else ""
    is_srv = uri_lower.startswith("mongodb+srv://")
    use_tls = is_srv

    try:
        parsed = urlparse(uri)
        qs = parse_qs(parsed.query)
        if 'tls' in qs:
            v = qs['tls'][0].lower()
            use_tls = v in ('1', 'true', 'yes', 'on')
        elif 'ssl' in qs:
            v = qs['ssl'][0].lower()
            use_tls = v in ('1', 'true', 'yes', 'on')
    except Exception:
        pass

    kwargs = {
        'serverSelectionTimeoutMS': 30000,
        'connectTimeoutMS': 30000,
        'socketTimeoutMS': 30000,
    }

    if use_tls:
        kwargs['tls'] = True
        kwargs['tlsAllowInvalidCertificates'] = True

    return MongoClient(uri, **kwargs)


def get_mongo_client() -> MongoClient:
    """Get or create the MongoDB client"""
    global _client
    
    if _client is None:
        uri = settings.mongo_uri
        try:
            # Auto-patch URI if it contains unescaped credentials
            patched_uri = patch_mongo_uri(uri)
            _client = _create_client(patched_uri)
            _client.admin.command("ping")
            logger.info("✅ SaaS MongoDB client connected")
        except Exception as e:
            logger.error(f"❌ Failed to connect to MongoDB: {e}")
            raise RuntimeError(f"Cannot connect to MongoDB: {e}")
    
    return _client


def get_saas_root_db() -> Database:
    """Get the root SaaS database (saas_root_db)"""
    client = get_mongo_client()
    return client[SAAS_ROOT_DB_NAME]


def get_school_database(database_name: str) -> Database:
    """Get a specific school's database by name"""
    global _db_cache
    
    if database_name in _db_cache:
        return _db_cache[database_name]
    
    client = get_mongo_client()
    db = client[database_name]
    _db_cache[database_name] = db
    
    logger.debug(f"📦 Connected to school database: {database_name}")
    return db


def generate_database_name(school_name: str) -> str:
    """Generate a safe database name from school name"""
    # Remove special characters and spaces, convert to lowercase
    safe_name = re.sub(r'[^a-zA-Z0-9]', '_', school_name.lower())
    safe_name = re.sub(r'_+', '_', safe_name).strip('_')
    
    # Add prefix and timestamp for uniqueness
    timestamp = datetime.utcnow().strftime('%Y%m%d')
    db_name = f"school_{safe_name}_{timestamp}"
    
    # Ensure name is not too long (MongoDB limit is 64 chars)
    if len(db_name) > 60:
        db_name = db_name[:60]
    
    return db_name


def create_school_database(database_name: str) -> bool:
    """
    Create a new database for a school with initial collections and indexes.
    Returns True if successful, False otherwise.
    """
    try:
        client = get_mongo_client()
        db = client[database_name]
        
        # Create essential collections with indexes
        collections_to_create = [
            "users",
            "students",
            "teachers",
            "classes",
            "subjects",
            "fees",
            "fee_categories",
            "payments",
            "chalans",
            "attendance",
            "grades",
            "notifications",
            "schools",  # For school-specific settings
        ]
        
        for collection_name in collections_to_create:
            # Create collection by inserting and removing a dummy document
            # This ensures the collection exists
            if collection_name not in db.list_collection_names():
                db.create_collection(collection_name)
        
        # Create essential indexes
        db.users.create_index("email", unique=True)
        db.students.create_index("school_id")
        db.students.create_index("student_id", sparse=True)
        db.teachers.create_index("school_id")
        db.classes.create_index("school_id")
        db.fees.create_index("school_id")
        db.payments.create_index("school_id")
        db.attendance.create_index([("school_id", 1), ("date", -1)])
        
        logger.info(f"✅ Created school database: {database_name}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create school database {database_name}: {e}")
        return False


def delete_school_database(database_name: str) -> bool:
    """
    Delete a school's database (use with caution!)
    Returns True if successful, False otherwise.
    """
    try:
        client = get_mongo_client()
        client.drop_database(database_name)
        
        # Remove from cache
        global _db_cache
        if database_name in _db_cache:
            del _db_cache[database_name]
        
        logger.info(f"🗑️ Deleted school database: {database_name}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to delete school database {database_name}: {e}")
        return False


def get_database_stats(database_name: str) -> Dict[str, Any]:
    """
    Get database statistics using dbStats command.
    Returns dict with storage_bytes, data_size, index_size, object_count, etc.
    """
    try:
        db = get_school_database(database_name)
        stats = db.command("dbStats")
        
        return {
            "storage_bytes": stats.get("storageSize", 0),
            "data_size": stats.get("dataSize", 0),
            "index_size": stats.get("indexSize", 0),
            "object_count": stats.get("objects", 0),
            "collection_count": stats.get("collections", 0),
            "avg_obj_size": stats.get("avgObjSize", 0),
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get stats for database {database_name}: {e}")
        return {
            "storage_bytes": 0,
            "data_size": 0,
            "index_size": 0,
            "object_count": 0,
            "collection_count": 0,
            "avg_obj_size": 0,
        }


def get_school_entity_counts(database_name: str) -> Dict[str, int]:
    """
    Get counts of major entities in a school database.
    """
    try:
        db = get_school_database(database_name)
        
        return {
            "student_count": db.students.count_documents({}),
            "teacher_count": db.teachers.count_documents({}),
            "user_count": db.users.count_documents({}),
            "class_count": db.classes.count_documents({}) if "classes" in db.list_collection_names() else 0,
            "payment_count": db.payments.count_documents({}) if "payments" in db.list_collection_names() else 0,
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get entity counts for {database_name}: {e}")
        return {
            "student_count": 0,
            "teacher_count": 0,
            "user_count": 0,
            "class_count": 0,
            "payment_count": 0,
        }


def verify_database_exists(database_name: str) -> bool:
    """Check if a database exists"""
    try:
        client = get_mongo_client()
        return database_name in client.list_database_names()
    except Exception:
        return False


def get_all_school_databases() -> list:
    """Get list of all school database names (those starting with 'school_')"""
    try:
        client = get_mongo_client()
        all_dbs = client.list_database_names()
        return [db for db in all_dbs if db.startswith("school_")]
    except Exception as e:
        logger.error(f"❌ Failed to list school databases: {e}")
        return []


# ================= Context-aware Database Access =================

class DatabaseContext:
    """
    Context manager for database operations with a specific school database.
    Usage:
        with DatabaseContext(database_name) as db:
            db.students.find(...)
    """
    def __init__(self, database_name: str):
        self.database_name = database_name
        self.db = None
    
    def __enter__(self) -> Database:
        self.db = get_school_database(self.database_name)
        return self.db
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # No cleanup needed, connection is pooled
        pass


# ================= School Lookup Helpers =================

def get_school_by_admin_email(email: str) -> Optional[Dict]:
    """Look up a school by admin email from saas_root_db"""
    try:
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"admin_email": email.lower()})
        if school:
            school["id"] = str(school.pop("_id"))
        return school
    except Exception as e:
        logger.error(f"❌ Failed to look up school by email {email}: {e}")
        return None


def get_school_by_database_name(database_name: str) -> Optional[Dict]:
    """Look up a school by database name from saas_root_db"""
    try:
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"database_name": database_name})
        if school:
            school["id"] = str(school.pop("_id"))
        return school
    except Exception as e:
        logger.error(f"❌ Failed to look up school by database {database_name}: {e}")
        return None


def get_school_by_id(school_id: str) -> Optional[Dict]:
    """Look up a school by school_id from saas_root_db"""
    try:
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"school_id": school_id})
        if not school:
            # Try with ObjectId
            try:
                school = root_db.schools.find_one({"_id": ObjectId(school_id)})
            except:
                pass
        if school:
            school["id"] = str(school.pop("_id"))
        return school
    except Exception as e:
        logger.error(f"❌ Failed to look up school by id {school_id}: {e}")
        return None


# ================= Global Users Management =================

def get_global_user_by_email(email: str) -> Optional[Dict]:
    """
    Look up a user by email from saas_root_db.global_users.
    This is the ONLY authentication source.
    """
    try:
        root_db = get_saas_root_db()
        user = root_db.global_users.find_one({"email": email.lower().strip()})
        if user:
            user["id"] = str(user.pop("_id"))
        return user
    except Exception as e:
        logger.error(f"❌ Failed to look up global user by email {email}: {e}")
        return None


def get_global_user_by_id(user_id: str) -> Optional[Dict]:
    """Look up a user by ID from saas_root_db.global_users"""
    try:
        root_db = get_saas_root_db()
        user = root_db.global_users.find_one({"_id": ObjectId(user_id)})
        if user:
            user["id"] = str(user.pop("_id"))
        return user
    except Exception as e:
        logger.error(f"❌ Failed to look up global user by id {user_id}: {e}")
        return None


def create_global_user(user_data: Dict) -> Optional[Dict]:
    """
    Create a new user in saas_root_db.global_users.
    
    user_data should contain:
    - name: str
    - email: str (will be lowercased)
    - password_hash: str
    - role: str ("root", "admin", "staff")
    - school_id: Optional[str]
    - school_slug: Optional[str]
    - database_name: Optional[str]
    """
    try:
        root_db = get_saas_root_db()
        
        email = user_data.get("email", "").lower().strip()
        
        # Check if email already exists globally
        if root_db.global_users.find_one({"email": email}):
            logger.warning(f"❌ Global user creation failed - email exists: {email}")
            return None
        
        from datetime import datetime
        now = datetime.utcnow()
        
        user_doc = {
            "name": user_data.get("name"),
            "email": email,
            "password_hash": user_data.get("password_hash"),
            "role": user_data.get("role"),
            "school_id": user_data.get("school_id"),
            "school_slug": user_data.get("school_slug"),
            "database_name": user_data.get("database_name"),
            "is_active": user_data.get("is_active", True),
            "created_at": now,
            "updated_at": now,
        }
        
        result = root_db.global_users.insert_one(user_doc)
        user_doc["id"] = str(result.inserted_id)
        
        logger.info(f"✅ Created global user: {email} (Role: {user_doc['role']})")
        return user_doc
    except Exception as e:
        logger.error(f"❌ Failed to create global user: {e}")
        return None


def update_global_user(user_id: str, update_data: Dict) -> Optional[Dict]:
    """Update a global user in saas_root_db.global_users"""
    try:
        root_db = get_saas_root_db()
        
        from datetime import datetime
        update_data["updated_at"] = datetime.utcnow()
        
        result = root_db.global_users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result["id"] = str(result.pop("_id"))
            logger.info(f"✅ Updated global user: {user_id}")
        return result
    except Exception as e:
        logger.error(f"❌ Failed to update global user {user_id}: {e}")
        return None


def get_global_users_by_school(school_id: str) -> List[Dict]:
    """Get all global users for a specific school"""
    try:
        root_db = get_saas_root_db()
        users = list(root_db.global_users.find({"school_id": school_id}))
        for user in users:
            user["id"] = str(user.pop("_id"))
        return users
    except Exception as e:
        logger.error(f"❌ Failed to list global users for school {school_id}: {e}")
        return []


def delete_global_user(user_id: str, hard_delete: bool = False) -> bool:
    """Delete or deactivate a global user"""
    try:
        root_db = get_saas_root_db()
        
        if hard_delete:
            result = root_db.global_users.delete_one({"_id": ObjectId(user_id)})
            logger.info(f"🗑️ Hard deleted global user: {user_id}")
            return result.deleted_count > 0
        else:
            from datetime import datetime
            result = root_db.global_users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
            )
            logger.info(f"🗑️ Soft deleted global user: {user_id}")
            return result.modified_count > 0
    except Exception as e:
        logger.error(f"❌ Failed to delete global user {user_id}: {e}")
        return False


def generate_school_slug(school_name: str) -> str:
    """
    Generate a unique school slug from school name.
    Slug is lowercase, no spaces, alphanumeric with underscores only.
    """
    import re
    
    # Remove special characters, replace spaces with underscores, lowercase
    slug = re.sub(r'[^a-zA-Z0-9\s]', '', school_name.lower())
    slug = re.sub(r'\s+', '_', slug.strip())
    slug = re.sub(r'_+', '_', slug)
    
    # Ensure slug is unique
    root_db = get_saas_root_db()
    original_slug = slug
    counter = 1
    
    while root_db.schools.find_one({"school_slug": slug}):
        slug = f"{original_slug}_{counter}"
        counter += 1
    
    return slug


def get_school_by_slug(slug: str) -> Optional[Dict]:
    """Look up a school by school_slug from saas_root_db"""
    try:
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"school_slug": slug.lower()})
        if school:
            school["id"] = str(school.pop("_id"))
        return school
    except Exception as e:
        logger.error(f"❌ Failed to look up school by slug {slug}: {e}")
        return None
