"""
Migration Script: Move Legacy Users to global_users
====================================================

This script migrates existing users from individual school databases to the  
centralized saas_root_db.global_users collection.

Run this script ONCE after deploying the new multi-tenant architecture.

Usage:
    cd backend
    python -m scripts.migrate_users_to_global

What it does:
1. Scans all school databases (school_*)
2. Finds users in each school's 'users' collection
3. Validates no duplicates in global_users
4. Inserts users into saas_root_db.global_users with proper role/school mapping
5. Generates a report of migrated users
"""

import os
import sys
from datetime import datetime
from typing import List, Dict, Any
import json

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.services.saas_db import get_mongo_client, SAAS_ROOT_DB
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_all_school_databases() -> List[Dict[str, Any]]:
    """Get all schools from saas_root_db.schools"""
    client = get_mongo_client()
    root_db = client[SAAS_ROOT_DB]
    schools = list(root_db.schools.find({"status": {"$ne": "deleted"}}))
    return schools


def get_users_from_school_db(database_name: str) -> List[Dict[str, Any]]:
    """Get all users from a school's users collection"""
    client = get_mongo_client()
    school_db = client[database_name]
    
    # Try common collection names
    for collection_name in ['users', 'staff', 'admins']:
        if collection_name in school_db.list_collection_names():
            users = list(school_db[collection_name].find({}))
            if users:
                logger.info(f"  Found {len(users)} users in {database_name}.{collection_name}")
                return users
    
    return []


def migrate_user_to_global(
    user: Dict[str, Any],
    school: Dict[str, Any],
    dry_run: bool = True
) -> Dict[str, Any]:
    """
    Migrate a single user to global_users
    
    Returns migration result dict
    """
    client = get_mongo_client()
    root_db = client[SAAS_ROOT_DB]
    global_users = root_db.global_users
    
    email = user.get('email', '').lower().strip()
    if not email:
        return {"status": "skipped", "reason": "no_email", "user_id": str(user.get('_id'))}
    
    # Check if user already exists in global_users
    existing = global_users.find_one({"email": email})
    if existing:
        return {
            "status": "skipped",
            "reason": "already_exists",
            "email": email,
            "existing_school_id": existing.get('school_id')
        }
    
    # Determine role
    user_role = user.get('role', 'Staff').lower()
    if user_role in ['admin', 'superadmin', 'school_admin']:
        role = 'admin'
    elif user_role == 'root':
        role = 'root'
    else:
        role = 'staff'
    
    # Build global user document
    now = datetime.utcnow().isoformat()
    global_user_doc = {
        "email": email,
        "name": user.get('name') or user.get('full_name') or email.split('@')[0],
        "password_hash": user.get('password_hash') or user.get('hashed_password') or user.get('password'),
        "role": role,
        "school_id": str(school.get('school_id', school.get('_id'))),
        "school_slug": school.get('school_slug', ''),
        "database_name": school.get('database_name', ''),
        "is_active": user.get('is_active', True),
        "created_at": user.get('created_at') or now,
        "updated_at": now,
        "migrated_from": {
            "database": school.get('database_name'),
            "original_id": str(user.get('_id')),
            "original_role": user.get('role'),
            "migrated_at": now
        }
    }
    
    if dry_run:
        return {
            "status": "would_migrate",
            "email": email,
            "role": role,
            "school": school.get('school_name'),
            "database": school.get('database_name')
        }
    
    # Actually insert
    try:
        result = global_users.insert_one(global_user_doc)
        return {
            "status": "migrated",
            "email": email,
            "role": role,
            "school": school.get('school_name'),
            "global_user_id": str(result.inserted_id)
        }
    except Exception as e:
        return {
            "status": "error",
            "email": email,
            "error": str(e)
        }


def run_migration(dry_run: bool = True):
    """
    Run the full migration process
    """
    logger.info("=" * 60)
    logger.info("LEGACY USER MIGRATION TO global_users")
    logger.info(f"Mode: {'DRY RUN' if dry_run else 'LIVE MIGRATION'}")
    logger.info("=" * 60)
    
    schools = get_all_school_databases()
    logger.info(f"Found {len(schools)} schools to process")
    
    migration_report = {
        "timestamp": datetime.utcnow().isoformat(),
        "mode": "dry_run" if dry_run else "live",
        "schools_processed": 0,
        "users_migrated": 0,
        "users_skipped": 0,
        "users_errored": 0,
        "details": []
    }
    
    for school in schools:
        school_name = school.get('school_name', 'Unknown')
        database_name = school.get('database_name', '')
        
        logger.info(f"\n[{school_name}] Processing database: {database_name}")
        
        if not database_name:
            logger.warning(f"  Skipping - no database_name")
            continue
        
        users = get_users_from_school_db(database_name)
        
        if not users:
            logger.info(f"  No users found in {database_name}")
            continue
        
        migration_report["schools_processed"] += 1
        
        for user in users:
            result = migrate_user_to_global(user, school, dry_run=dry_run)
            migration_report["details"].append(result)
            
            if result["status"] == "migrated" or result["status"] == "would_migrate":
                migration_report["users_migrated"] += 1
                logger.info(f"  ✅ {'Would migrate' if dry_run else 'Migrated'}: {result.get('email')} ({result.get('role')})")
            elif result["status"] == "skipped":
                migration_report["users_skipped"] += 1
                logger.info(f"  ⏭️ Skipped: {result.get('email', result.get('user_id', 'unknown'))} - {result.get('reason')}")
            else:
                migration_report["users_errored"] += 1
                logger.error(f"  ❌ Error: {result.get('email')} - {result.get('error')}")
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("MIGRATION SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Schools processed: {migration_report['schools_processed']}")
    logger.info(f"Users {'would be migrated' if dry_run else 'migrated'}: {migration_report['users_migrated']}")
    logger.info(f"Users skipped: {migration_report['users_skipped']}")
    logger.info(f"Users errored: {migration_report['users_errored']}")
    
    # Save report
    report_path = os.path.join(backend_dir, 'scripts', f'migration_report_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json')
    with open(report_path, 'w') as f:
        json.dump(migration_report, f, indent=2, default=str)
    logger.info(f"\nReport saved to: {report_path}")
    
    return migration_report


def create_root_user_if_needed():
    """
    Ensure at least one root user exists in global_users
    """
    client = get_mongo_client()
    root_db = client[SAAS_ROOT_DB]
    global_users = root_db.global_users
    
    # Check for existing root user
    root_user = global_users.find_one({"role": "root"})
    if root_user:
        logger.info(f"Root user already exists: {root_user.get('email')}")
        return
    
    # Create default root user
    import hashlib
    default_password = "root123456"  # CHANGE THIS IN PRODUCTION!
    password_hash = hashlib.sha256(default_password.encode()).hexdigest()
    
    root_doc = {
        "email": "root@system.local",
        "name": "Root Admin",
        "password_hash": password_hash,
        "role": "root",
        "school_id": None,
        "school_slug": None,
        "database_name": None,
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    
    global_users.insert_one(root_doc)
    logger.info(f"Created root user: root@system.local (password: {default_password})")
    logger.warning("⚠️ CHANGE THE ROOT PASSWORD IMMEDIATELY IN PRODUCTION!")


def ensure_global_users_indexes():
    """Create necessary indexes on global_users collection"""
    client = get_mongo_client()
    root_db = client[SAAS_ROOT_DB]
    global_users = root_db.global_users
    
    # Unique index on email
    global_users.create_index("email", unique=True)
    # Index for school lookups
    global_users.create_index("school_id")
    # Index for role-based queries
    global_users.create_index("role")
    # Compound index for school + role
    global_users.create_index([("school_id", 1), ("role", 1)])
    
    logger.info("Created indexes on global_users collection")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate legacy users to global_users")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Actually perform the migration (default is dry run)"
    )
    parser.add_argument(
        "--create-root",
        action="store_true",
        help="Create default root user if none exists"
    )
    parser.add_argument(
        "--indexes",
        action="store_true",
        help="Create indexes on global_users collection"
    )
    
    args = parser.parse_args()
    
    if args.indexes:
        ensure_global_users_indexes()
    
    if args.create_root:
        create_root_user_if_needed()
    
    if not args.indexes or args.live or not args.create_root:
        # Run migration unless only --indexes or --create-root was specified
        run_migration(dry_run=not args.live)
