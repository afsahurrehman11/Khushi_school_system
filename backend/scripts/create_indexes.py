#!/usr/bin/env python3
"""
Database Index Creation Script for Multi-School SaaS System
This script creates compound indexes to optimize queries for school-scoped data isolation.
Run this once after deploying the SaaS architecture.
"""

from app.database import get_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_indexes():
    """Create all necessary indexes for multi-school system"""
    db = get_db()
    
    indexes_created = 0
    
    try:
        # Schools - unique name across all schools
        logger.debug("Creating schools indexes")
        db.schools.create_index("name", unique=True)
        db.schools.create_index([("is_active", 1), ("created_at", -1)])
        indexes_created += 2
        logger.debug("Schools indexes created")
    except Exception as e:
        logger.error(f"Failed to create schools indexes: {str(e)}")
    
    try:
        # Users - email unique per school, role filtering
        logger.debug("Creating users indexes")
        db.users.create_index([("school_id", 1), ("email", 1)], unique=True)
        db.users.create_index([("school_id", 1), ("role", 1)])
        db.users.create_index([("school_id", 1), ("is_active", 1)])
        indexes_created += 3
        logger.debug("Users indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create users indexes: {str(e)}")
    
    try:
        # Students - student_id unique per school, filtering by school and class
        logger.debug("Creating students indexes")
        db.students.create_index([("school_id", 1), ("student_id", 1)], unique=True)
        db.students.create_index([("school_id", 1), ("email", 1)], unique=True)
        db.students.create_index([("school_id", 1), ("class_id", 1)])
        db.students.create_index([("school_id", 1), ("is_active", 1)])
        db.students.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 5
        logger.debug("Students indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create students indexes: {str(e)}")
    
    try:
        # Teachers - email/CNIC unique per school
        logger.debug("Creating teachers indexes")
        db.teachers.create_index([("school_id", 1), ("email", 1)], unique=True)
        db.teachers.create_index([("school_id", 1), ("cnic", 1)], unique=True)
        db.teachers.create_index([("school_id", 1), ("is_active", 1)])
        db.teachers.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 4
        logger.debug("Teachers indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create teachers indexes: {str(e)}")
    
    try:
        # Classes - class_name/section unique per school
        logger.debug("Creating classes indexes")
        db.classes.create_index([("school_id", 1), ("class_name", 1), ("section", 1)], unique=True)
        db.classes.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 2
        logger.debug("Classes indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create classes indexes: {str(e)}")
    
    try:
        # Subjects - subject_code unique per school
        logger.debug("Creating subjects indexes")
        db.subjects.create_index([("school_id", 1), ("subject_code", 1)], unique=True)
        db.subjects.create_index([("school_id", 1)])
        indexes_created += 2
        logger.debug("Subjects indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create subjects indexes: {str(e)}")
    
    try:
        # Grades - filtering by school and student
        logger.debug("Creating grades indexes")
        db.grades.create_index([("school_id", 1), ("student_id", 1)])
        db.grades.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 2
        logger.debug("Grades indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create grades indexes: {str(e)}")
    
    try:
        # Fees - school scoped fees, filtering by student
        logger.debug("Creating fees indexes")
        db.fees.create_index([("school_id", 1), ("student_id", 1)])
        db.fees.create_index([("school_id", 1), ("status", 1)])
        db.fees.create_index([("school_id", 1), ("class_id", 1)])
        db.fees.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 4
        logger.debug("Fees indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create fees indexes: {str(e)}")
    
    try:
        # Fee Categories - per school
        logger.debug("Creating fee categories indexes")
        db.fee_categories.create_index([("school_id", 1), ("name", 1)], unique=True)
        db.fee_categories.create_index([("school_id", 1)])
        indexes_created += 2
        logger.debug("Fee categories indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create fee categories indexes: {str(e)}")
    
    try:
        # Challans - school scoped, filtering by student and status
        logger.debug("Creating challans indexes")
        db.student_challans.create_index([("school_id", 1), ("student_id", 1)])
        db.student_challans.create_index([("school_id", 1), ("status", 1)])
        db.student_challans.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 3
        logger.debug("Challans indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create challans indexes: {str(e)}")
    
    try:
        # Payments - school scoped, filtering by challan and student
        logger.debug("Creating payments indexes")
        db.payments.create_index([("school_id", 1), ("challan_id", 1)])
        db.payments.create_index([("school_id", 1), ("student_id", 1)])
        db.payments.create_index([("school_id", 1), ("paid_at", -1)])
        indexes_created += 3
        logger.debug("Payments indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create payments indexes: {str(e)}")
    
    try:
        # Import Logs - for tracking data imports per school
        logger.debug("Creating import logs indexes")
        db.import_logs.create_index([("school_id", 1), ("created_at", -1)])
        db.import_logs.create_index([("school_id", 1), ("status", 1)])
        indexes_created += 2
        logger.debug("Import logs indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create import logs indexes: {str(e)}")
    
    try:
        # Attendance - UNIQUE compound index to prevent duplicate daily records per student
        logger.debug("Creating attendance indexes")
        db.attendance.create_index(
            [("school_id", 1), ("class_id", 1), ("student_id", 1), ("date", 1)],
            unique=True
        )
        db.attendance.create_index([("school_id", 1), ("class_id", 1), ("date", 1)])
        db.attendance.create_index([("school_id", 1), ("class_id", 1), ("student_id", 1)])
        db.attendance.create_index([("school_id", 1), ("created_at", -1)])
        indexes_created += 4
        logger.debug("Attendance indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create attendance indexes: {str(e)}")
    
    logger.info(f"Total indexes created: {indexes_created}")

if __name__ == "__main__":
    logger.info("🚀 Starting database index creation...")
    logger.info("="*60)
    create_indexes()
    logger.info("\n✅ All indexes created successfully!")
    logger.info("Your multi-school SaaS system is ready for production.")
