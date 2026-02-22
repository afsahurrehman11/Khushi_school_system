"""
SaaS Database Service
Handles multi-tenant database operations for the SaaS system
"""

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConfigurationError
from typing import Optional, Dict, Any
import logging
import os
import re
from datetime import datetime
from bson import ObjectId
from app.config import settings

logger = logging.getLogger(__name__)

# Root SaaS database name
SAAS_ROOT_DB_NAME = "saas_root_db"

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
            _client = _create_client(uri)
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
