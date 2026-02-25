"""
Clean Database Setup Script
===========================
Sets up a clean database with:
- 1 root user: root@edu / 111
- 1 school: Khushi with admin Khushi@school / 111
- Empty school (no students, teachers, staff)

Run: python -m scripts.setup_clean_db
"""

import os
import sys
import hashlib
from datetime import datetime

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from pymongo import MongoClient
from app.config import settings

# Database names
SAAS_ROOT_DB = "saas_root_db"
SCHOOL_DB = "khushi_school"  # Single school database

# System databases to NOT delete
SYSTEM_DBS = ["admin", "local", "config"]

def get_client():
    """Get MongoDB client"""
    uri = settings.mongo_uri
    client = MongoClient(uri, serverSelectionTimeoutMS=30000)
    client.admin.command("ping")
    print("✅ Connected to MongoDB")
    return client

def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def cleanup_databases(client):
    """Delete all project databases except system ones"""
    print("\n🗑️ Cleaning up databases...")
    
    all_dbs = client.list_database_names()
    deleted = []
    
    for db_name in all_dbs:
        # Skip system databases
        if db_name in SYSTEM_DBS:
            print(f"  ⏭️ Skipping system DB: {db_name}")
            continue
        
        # Delete all project databases (school_*, saas_root_db, khushi_*, etc.)
        # Keep only the ones we're about to create fresh
        if db_name.startswith("school_") or db_name == "saas_root_db" or db_name.startswith("khushi"):
            client.drop_database(db_name)
            deleted.append(db_name)
            print(f"  🗑️ Deleted: {db_name}")
    
    if deleted:
        print(f"\n✅ Deleted {len(deleted)} databases: {deleted}")
    else:
        print("\n✅ No project databases to delete")

def setup_root_db(client):
    """Setup saas_root_db with root user and one school"""
    print("\n📦 Setting up saas_root_db...")
    
    root_db = client[SAAS_ROOT_DB]
    
    # Drop existing collections to start fresh
    for coll in root_db.list_collection_names():
        root_db.drop_collection(coll)
    
    # Create collections
    root_db.create_collection("schools")
    root_db.create_collection("global_users")
    root_db.create_collection("usage_snapshots")
    
    # Create indexes
    root_db.global_users.create_index("email", unique=True)
    root_db.global_users.create_index("school_id")
    root_db.global_users.create_index("role")
    root_db.schools.create_index("school_slug", unique=True, sparse=True)
    root_db.schools.create_index("school_id", unique=True)
    
    now = datetime.utcnow().isoformat()
    
    # Create ROOT user
    root_user = {
        "email": "root@edu",
        "name": "Root Administrator",
        "password_hash": hash_password("111"),
        "role": "root",
        "school_id": None,
        "school_slug": None,
        "database_name": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    root_db.global_users.insert_one(root_user)
    print("  ✅ Created root user: root@edu / 111")
    
    # Create ONE school
    school_id = "khushi_school_001"
    school_slug = "khushi"
    database_name = SCHOOL_DB
    
    school_doc = {
        "school_id": school_id,
        "school_name": "Khushi School",
        "school_slug": school_slug,
        "database_name": database_name,
        "admin_email": "khushi@school",
        "hashed_password": hash_password("111"),
        "plan": "standard",
        "status": "active",
        "email": "info@khushi.edu",
        "phone": None,
        "address": None,
        "city": None,
        "state": None,
        "country": None,
        "postal_code": None,
        "logo_url": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "suspended_at": None,
        "deleted_at": None,
        "student_count": 0,
        "teacher_count": 0,
        "storage_bytes": 0,
        "last_stats_update": None,
    }
    root_db.schools.insert_one(school_doc)
    print(f"  ✅ Created school: Khushi School (DB: {database_name})")
    
    # Create ADMIN user for the school
    admin_user = {
        "email": "khushi@school",
        "name": "Khushi School Admin",
        "password_hash": hash_password("111"),
        "role": "admin",
        "school_id": school_id,
        "school_slug": school_slug,
        "database_name": database_name,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    root_db.global_users.insert_one(admin_user)
    print("  ✅ Created admin user: khushi@school / 111")
    
    print(f"\n✅ saas_root_db setup complete")
    print(f"   - global_users: 2 (root + admin)")
    print(f"   - schools: 1")

def setup_school_db(client):
    """Setup empty school database with required collections"""
    print(f"\n📦 Setting up school database: {SCHOOL_DB}")
    
    school_db = client[SCHOOL_DB]
    
    # Drop existing collections to start fresh
    for coll in school_db.list_collection_names():
        school_db.drop_collection(coll)
    
    # Create empty collections (no data, just structure)
    collections = [
        "schools",      # School info
        "students",     # Empty
        "teachers",     # Empty
        "classes",      # Empty
        "subjects",     # Empty
        "fees",         # Empty
        "fee_categories",
        "payments",
        "student_challans",
        "attendance",
        "grades",
        "notifications",
        "payment_methods",
        "cash_sessions",
        "class_fee_assignments",
        "import_logs",
        "roles",
    ]
    
    for coll_name in collections:
        school_db.create_collection(coll_name)
    
    # Create basic indexes
    school_db.students.create_index("student_id", sparse=True)
    school_db.teachers.create_index("email", sparse=True)
    school_db.classes.create_index("name", sparse=True)
    
    # Add school info document
    school_info = {
        "name": "khushi",
        "display_name": "Khushi School",
        "school_slug": "khushi",
        "email": "info@khushi.edu",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    school_db.schools.insert_one(school_info)
    
    # Add default roles
    roles = [
        {"name": "Admin", "permissions": ["*"], "created_at": datetime.utcnow()},
        {"name": "Teacher", "permissions": ["students:read", "classes:read", "attendance:*"], "created_at": datetime.utcnow()},
        {"name": "Accountant", "permissions": ["fees:*", "payments:*", "students:read"], "created_at": datetime.utcnow()},
    ]
    school_db.roles.insert_many(roles)
    
    print(f"  ✅ Created {len(collections)} empty collections")
    print(f"  ✅ Added school info and default roles")
    print(f"\n✅ School database setup complete (EMPTY - no students/teachers)")

def verify_setup(client):
    """Verify the setup is correct"""
    print("\n🔍 Verifying setup...")
    
    # Check saas_root_db
    root_db = client[SAAS_ROOT_DB]
    
    users = list(root_db.global_users.find({}))
    schools = list(root_db.schools.find({}))
    
    print(f"\n📊 saas_root_db:")
    print(f"   global_users: {len(users)}")
    for u in users:
        print(f"     - {u['email']} ({u['role']})")
    print(f"   schools: {len(schools)}")
    for s in schools:
        print(f"     - {s['school_name']} (DB: {s['database_name']})")
    
    # Check school_db
    school_db = client[SCHOOL_DB]
    
    students = school_db.students.count_documents({})
    teachers = school_db.teachers.count_documents({})
    
    print(f"\n📊 {SCHOOL_DB}:")
    print(f"   students: {students}")
    print(f"   teachers: {teachers}")
    
    # List all databases
    all_dbs = [db for db in client.list_database_names() if db not in SYSTEM_DBS]
    print(f"\n📊 All project databases: {all_dbs}")

def main():
    print("=" * 60)
    print("CLEAN DATABASE SETUP")
    print("=" * 60)
    
    client = get_client()
    
    # Step 1: Clean up all existing databases
    cleanup_databases(client)
    
    # Step 2: Setup saas_root_db with root user and school
    setup_root_db(client)
    
    # Step 3: Setup empty school database
    setup_school_db(client)
    
    # Step 4: Verify
    verify_setup(client)
    
    print("\n" + "=" * 60)
    print("✅ SETUP COMPLETE!")
    print("=" * 60)
    print("\nCredentials:")
    print("  ROOT:  root@edu / 111")
    print("  ADMIN: khushi@school / 111")
    print("\nDatabases:")
    print(f"  - {SAAS_ROOT_DB} (root database)")
    print(f"  - {SCHOOL_DB} (empty school)")
    print("=" * 60)

if __name__ == "__main__":
    main()
