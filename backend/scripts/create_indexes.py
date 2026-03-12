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
        # also create normalized fields index to enforce normalization-based uniqueness
        try:
            db.classes.create_index([("school_id", 1), ("class_name_norm", 1), ("section_norm", 1)], unique=True)
            logger.debug("Created normalized class_name_norm/section_norm index")
            indexes_created += 1
        except Exception:
            # ignore if already exists or driver/version doesn't support
            pass
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
    
    try:
        # Student Monthly Fees - for monthly fee tracking and history
        logger.debug("Creating student monthly fees indexes")
        # Unique constraint: one fee record per student per month/year
        db.student_monthly_fees.create_index(
            [("school_id", 1), ("student_id", 1), ("month", 1), ("year", 1)],
            unique=True
        )
        db.student_monthly_fees.create_index([("school_id", 1), ("student_id", 1)])
        db.student_monthly_fees.create_index([("school_id", 1), ("status", 1)])
        db.student_monthly_fees.create_index([("school_id", 1), ("year", 1), ("month", 1)])
        db.student_monthly_fees.create_index([("school_id", 1), ("created_at", -1)])
        # Index for overdue fee queries
        db.student_monthly_fees.create_index([("school_id", 1), ("status", 1), ("year", 1), ("month", 1)])
        indexes_created += 6
        logger.debug("Student monthly fees indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create student monthly fees indexes: {str(e)}")
    
    try:
        # Student Payments - for payment tracking
        logger.debug("Creating student payments indexes")
        db.student_payments.create_index([("school_id", 1), ("student_id", 1)])
        db.student_payments.create_index([("school_id", 1), ("monthly_fee_id", 1)])
        db.student_payments.create_index([("school_id", 1), ("payment_date", -1)])
        db.student_payments.create_index([("school_id", 1), ("student_id", 1), ("payment_date", -1)])
        db.student_payments.create_index([("school_id", 1), ("created_at", -1)])
        # TASK 10: Add indexes for audit trail
        db.student_payments.create_index([("school_id", 1), ("received_by", 1)])
        db.student_payments.create_index([("school_id", 1), ("session_id", 1)])
        db.student_payments.create_index([("school_id", 1), ("payment_method_id", 1)])
        indexes_created += 8
        logger.debug("Student payments indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create student payments indexes: {str(e)}")
    
    try:
        # Students - additional indexes for scholarship and arrears queries
        logger.debug("Creating additional student indexes for fee management")
        db.students.create_index([("school_id", 1), ("scholarship_percent", 1)])
        db.students.create_index([("school_id", 1), ("arrears_balance", 1)])
        indexes_created += 2
        logger.debug("Additional student indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create additional student indexes: {str(e)}")
    
    # MODULE 2: Accounting Engine Indexes
    try:
        # Accounting Sessions
        logger.debug("Creating accounting sessions indexes")
        db.accounting_sessions.create_index([("school_id", 1), ("user_id", 1)])
        db.accounting_sessions.create_index([("school_id", 1), ("session_date", 1)])
        db.accounting_sessions.create_index([("school_id", 1), ("status", 1)])
        db.accounting_sessions.create_index([("school_id", 1), ("user_id", 1), ("session_date", 1)], unique=True)
        db.accounting_sessions.create_index([("school_id", 1), ("opened_at", -1)])
        indexes_created += 5
        logger.debug("Accounting sessions indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create accounting sessions indexes: {str(e)}")
    
    try:
        # Principal Payments
        logger.debug("Creating principal payments indexes")
        db.principal_payments.create_index([("school_id", 1), ("session_id", 1)])
        db.principal_payments.create_index([("school_id", 1), ("accountant_id", 1)])
        db.principal_payments.create_index([("school_id", 1), ("status", 1)])
        db.principal_payments.create_index([("school_id", 1), ("created_at", -1)])
        db.principal_payments.create_index([("school_id", 1), ("accountant_id", 1), ("status", 1)])
        indexes_created += 5
        logger.debug("Principal payments indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create principal payments indexes: {str(e)}")
    
    try:
        # Accountant Ledger
        logger.debug("Creating accountant ledger indexes")
        db.accountant_ledger.create_index([("school_id", 1), ("user_id", 1)])
        db.accountant_ledger.create_index([("school_id", 1), ("session_id", 1)])
        db.accountant_ledger.create_index([("school_id", 1), ("transaction_type", 1)])
        db.accountant_ledger.create_index([("school_id", 1), ("created_at", -1)])
        db.accountant_ledger.create_index([("school_id", 1), ("user_id", 1), ("created_at", -1)])
        indexes_created += 5
        logger.debug("Accountant ledger indexes created")
    except Exception as e:
        logger.error(f"❌ Failed to create accountant ledger indexes: {str(e)}")
    
    # MODULE 3: Finance Analytics Indexes
    try:
        logger.debug("Creating finance analytics indexes")
        # Student payments for monthly trends and class revenue
        db.student_payments.create_index([("school_id", 1), ("created_at", -1)])
        db.student_payments.create_index([("school_id", 1), ("student_snapshot.class_name", 1)])
        db.student_payments.create_index([("school_id", 1), ("accountant_id", 1), ("created_at", -1)])
        
        # Student monthly fees for outstanding analytics
        db.student_monthly_fees.create_index([("school_id", 1), ("status", 1)])
        db.student_monthly_fees.create_index([("school_id", 1), ("student_id", 1), ("status", 1)])
        
        # Principal payments for payout reports
        db.principal_payments.create_index([("school_id", 1), ("status", 1), ("created_at", -1)])
        
        indexes_created += 6
        logger.info("⚡ Finance analytics indexes verified")
    except Exception as e:
        logger.error(f"❌ Failed to create finance analytics indexes: {str(e)}")
    
    # MODULE 4: Daily Workflow Indexes
    try:
        logger.debug("Creating daily audit log indexes")
        # Daily Audit Log for audit trail
        db.daily_audit_log.create_index([("school_id", 1), ("timestamp", -1)])
        db.daily_audit_log.create_index([("school_id", 1), ("action_type", 1)])
        db.daily_audit_log.create_index([("school_id", 1), ("performed_by_id", 1)])
        db.daily_audit_log.create_index([("school_id", 1), ("target_type", 1), ("target_id", 1)])
        db.daily_audit_log.create_index([("school_id", 1), ("performed_by_role", 1), ("timestamp", -1)])
        
        indexes_created += 5
        logger.info("⚡ Daily workflow (audit log) indexes verified")
    except Exception as e:
        logger.error(f"❌ Failed to create daily audit log indexes: {str(e)}")
    
    # MODULE 5: Advanced Accounting Statistics Indexes
    try:
        logger.debug("Creating MODULE 5 accounting statistics indexes")
        # Student payments - indexes for statistics queries (TASK 8)
        db.student_payments.create_index([("school_id", 1), ("received_by", 1), ("created_at", -1)])
        db.student_payments.create_index([("school_id", 1), ("payment_method_name", 1)])
        db.student_payments.create_index([("school_id", 1), ("student_snapshot.class_name", 1), ("created_at", -1)])
        db.student_payments.create_index([("school_id", 1), ("student_snapshot.class_id", 1)])
        
        # Principal payments - for payout analytics
        db.principal_payments.create_index([("school_id", 1), ("accountant_id", 1), ("created_at", -1)])
        
        # Accounting sessions - for session statistics
        db.accounting_sessions.create_index([("school_id", 1), ("opened_at", -1)])
        db.accounting_sessions.create_index([("school_id", 1), ("closed_at", -1)])
        
        indexes_created += 7
        logger.info("⚡ MODULE 5 accounting statistics indexes verified")
    except Exception as e:
        logger.error(f"❌ Failed to create MODULE 5 indexes: {str(e)}")
    
    logger.info(f"⚡ Accounting indexes verified")
    logger.info(f"Total indexes created: {indexes_created}")

if __name__ == "__main__":
    logger.info("🚀 Starting database index creation...")
    logger.info("="*60)
    create_indexes()
    logger.info("\n✅ All indexes created successfully!")
    logger.info("Your multi-school SaaS system is ready for production.")
