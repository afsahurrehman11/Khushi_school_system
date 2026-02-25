"""
One-Time Cleanup Script for SaaS System

This script will:
1. Delete ALL school databases
2. Clean up saas_root_db collections:
   - schools (delete all)
   - global_users (keep ONLY root@edu)
   - payment_records (delete all)
   - usage_snapshots (delete all)
   - invoices (delete all)

This is a RESET script to remove all testing data and start fresh.

⚠️ WARNING: This operation is IRREVERSIBLE!

Usage:
    python scripts/cleanup_all_schools.py

To confirm deletion, you must type "DELETE ALL" when prompted.
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pymongo import MongoClient
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Root user to preserve
ROOT_EMAIL = "root@edu"


def get_mongo_client():
    """Get MongoDB client from environment or default"""
    from app.config import settings
    uri = settings.mongo_uri
    return MongoClient(uri)


def list_all_school_databases(client):
    """Get all database names that are school databases"""
    all_dbs = client.list_database_names()
    # School databases start with 'school_'
    school_dbs = [db for db in all_dbs if db.startswith('school_')]
    return school_dbs


def cleanup_saas_system():
    """
    Perform full cleanup of the SaaS system.
    Keeps only the root@edu user.
    """
    print("\n" + "="*60)
    print("⚠️  SAAS SYSTEM CLEANUP SCRIPT")
    print("="*60)
    print("\nThis script will:")
    print("  1. Drop ALL school databases")
    print("  2. Delete ALL entries from saas_root_db.schools")
    print("  3. Delete ALL global_users EXCEPT root@edu")
    print("  4. Delete ALL payment_records")
    print("  5. Delete ALL usage_snapshots")
    print("  6. Delete ALL invoices")
    print("\n⚠️  THIS OPERATION IS IRREVERSIBLE!")
    print("="*60)
    
    # Confirmation
    confirmation = input("\nType 'DELETE ALL' to confirm: ")
    if confirmation != "DELETE ALL":
        print("❌ Aborted. No changes made.")
        return False
    
    print("\n🔄 Starting cleanup...")
    
    try:
        client = get_mongo_client()
        root_db = client["saas_root_db"]
        
        summary = {
            "databases_dropped": 0,
            "schools_deleted": 0,
            "users_deleted": 0,
            "users_preserved": 0,
            "payment_records_deleted": 0,
            "usage_snapshots_deleted": 0,
            "invoices_deleted": 0,
        }
        
        # 1. Drop all school databases
        school_dbs = list_all_school_databases(client)
        print(f"\n📦 Found {len(school_dbs)} school databases")
        
        for db_name in school_dbs:
            try:
                client.drop_database(db_name)
                summary["databases_dropped"] += 1
                logger.info(f"🗑️ Dropped database: {db_name}")
            except Exception as e:
                logger.error(f"❌ Failed to drop {db_name}: {e}")
        
        # 2. Delete all schools
        result = root_db.schools.delete_many({})
        summary["schools_deleted"] = result.deleted_count
        logger.info(f"🗑️ Deleted {result.deleted_count} schools from saas_root_db.schools")
        
        # 3. Delete all global_users EXCEPT root@edu
        # First check if root user exists
        root_user = root_db.global_users.find_one({"email": ROOT_EMAIL})
        if root_user:
            logger.info(f"✅ Found root user: {ROOT_EMAIL} - will be preserved")
            summary["users_preserved"] = 1
        else:
            logger.warning(f"⚠️ Root user {ROOT_EMAIL} not found - will need to be created")
        
        # Delete all non-root users
        result = root_db.global_users.delete_many({"email": {"$ne": ROOT_EMAIL}})
        summary["users_deleted"] = result.deleted_count
        logger.info(f"🗑️ Deleted {result.deleted_count} users from global_users (kept root@edu)")
        
        # 4. Delete all payment_records
        if "payment_records" in root_db.list_collection_names():
            result = root_db.payment_records.delete_many({})
            summary["payment_records_deleted"] = result.deleted_count
            logger.info(f"🗑️ Deleted {result.deleted_count} payment_records")
        
        # 5. Delete all usage_snapshots
        if "usage_snapshots" in root_db.list_collection_names():
            result = root_db.usage_snapshots.delete_many({})
            summary["usage_snapshots_deleted"] = result.deleted_count
            logger.info(f"🗑️ Deleted {result.deleted_count} usage_snapshots")
        
        # 6. Delete all invoices
        if "invoices" in root_db.list_collection_names():
            result = root_db.invoices.delete_many({})
            summary["invoices_deleted"] = result.deleted_count
            logger.info(f"🗑️ Deleted {result.deleted_count} invoices")
        
        # Print summary
        print("\n" + "="*60)
        print("✅ CLEANUP COMPLETE")
        print("="*60)
        print(f"\n📊 Summary:")
        print(f"   Databases dropped:       {summary['databases_dropped']}")
        print(f"   Schools deleted:         {summary['schools_deleted']}")
        print(f"   Users deleted:           {summary['users_deleted']}")
        print(f"   Users preserved:         {summary['users_preserved']}")
        print(f"   Payment records deleted: {summary['payment_records_deleted']}")
        print(f"   Usage snapshots deleted: {summary['usage_snapshots_deleted']}")
        print(f"   Invoices deleted:        {summary['invoices_deleted']}")
        
        if not root_user:
            print(f"\n⚠️ IMPORTANT: Root user does not exist!")
            print(f"   Run: python scripts/setup_root_user.py")
        
        print("\n" + "="*60)
        return True
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}")
        return False


if __name__ == "__main__":
    cleanup_saas_system()
