#!/usr/bin/env python3
"""
Migration Script for Module M1: Database Schema
This script migrates existing student documents to include new fee management fields.
Run this once after deploying the M1 schema changes.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_students():
    """Add scholarship_percent and arrears_balance fields to existing students"""
    db = get_db()
    
    try:
        # Find all students that don't have the new fields
        students_to_migrate = db.students.count_documents({
            "$or": [
                {"scholarship_percent": {"$exists": False}},
                {"arrears_balance": {"$exists": False}}
            ]
        })
        
        logger.info(f"Found {students_to_migrate} students to migrate")
        
        if students_to_migrate == 0:
            logger.info("No students need migration")
            return
        
        # Update all students: add scholarship_percent and copy arrears to arrears_balance
        result = db.students.update_many(
            {"scholarship_percent": {"$exists": False}},
            {
                "$set": {
                    "scholarship_percent": 0.0
                }
            }
        )
        logger.info(f"Added scholarship_percent to {result.modified_count} students")
        
        # For arrears_balance, copy from existing arrears field if it exists
        # First, update students who have arrears but not arrears_balance
        result = db.students.update_many(
            {
                "arrears_balance": {"$exists": False},
                "arrears": {"$exists": True}
            },
            [
                {
                    "$set": {
                        "arrears_balance": "$arrears"
                    }
                }
            ]
        )
        logger.info(f"Copied arrears to arrears_balance for {result.modified_count} students")
        
        # Then update students who don't have either field
        result = db.students.update_many(
            {
                "arrears_balance": {"$exists": False}
            },
            {
                "$set": {
                    "arrears_balance": 0.0
                }
            }
        )
        logger.info(f"Set arrears_balance to 0 for {result.modified_count} students")
        
        # Verify migration
        remaining = db.students.count_documents({
            "$or": [
                {"scholarship_percent": {"$exists": False}},
                {"arrears_balance": {"$exists": False}}
            ]
        })
        
        if remaining == 0:
            logger.info("✅ All students migrated successfully!")
        else:
            logger.warning(f"⚠️  {remaining} students still need migration")
            
    except Exception as e:
        logger.error(f"❌ Migration failed: {str(e)}")
        raise

def create_collections():
    """Create new collections if they don't exist"""
    db = get_db()
    
    try:
        # Get existing collections
        existing_collections = db.list_collection_names()
        
        # Create student_monthly_fees collection if not exists
        if "student_monthly_fees" not in existing_collections:
            db.create_collection("student_monthly_fees")
            logger.info("✅ Created student_monthly_fees collection")
        else:
            logger.info("student_monthly_fees collection already exists")
        
        # Create student_payments collection if not exists
        if "student_payments" not in existing_collections:
            db.create_collection("student_payments")
            logger.info("✅ Created student_payments collection")
        else:
            logger.info("student_payments collection already exists")
            
    except Exception as e:
        logger.error(f"❌ Failed to create collections: {str(e)}")
        raise

def run_migration():
    """Run the complete M1 migration"""
    logger.info("=" * 60)
    logger.info("Starting M1 Database Schema Migration")
    logger.info("=" * 60)
    logger.info(f"Migration started at: {datetime.now().isoformat()}")
    
    # Step 1: Create new collections
    logger.info("\n📦 Step 1: Creating new collections...")
    create_collections()
    
    # Step 2: Migrate students
    logger.info("\n👥 Step 2: Migrating student documents...")
    migrate_students()
    
    # Step 3: Run index creation
    logger.info("\n📇 Step 3: Creating indexes...")
    try:
        from scripts.create_indexes import create_indexes
        create_indexes()
    except Exception as e:
        logger.warning(f"⚠️  Could not run index creation: {str(e)}")
        logger.info("Please run 'python scripts/create_indexes.py' manually")
    
    logger.info("\n" + "=" * 60)
    logger.info("✅ M1 Database Schema Migration Complete!")
    logger.info("=" * 60)
    logger.info(f"Migration completed at: {datetime.now().isoformat()}")

if __name__ == "__main__":
    run_migration()
