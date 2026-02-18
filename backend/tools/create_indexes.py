#!/usr/bin/env python3
"""
MongoDB Indexes Creation Script
Ensures optimal performance for multi-tenant SaaS with school isolation
"""

import sys
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure
sys.path.insert(0, '..')

from app.database import get_db

def create_indexes():
    """Create all necessary compound indexes for school isolation and performance"""
    db = get_db()
    
    indexes_config = [
        # Schools Collection
        {
            "collection": "schools",
            "indexes": [
                {"keys": [("name", ASCENDING)], "unique": True, "name": "idx_school_name"},
                {"keys": [("email", ASCENDING)], "sparse": True, "name": "idx_school_email"},
            ]
        },
        
        # Users Collection
        {
            "collection": "users",
            "indexes": [
                {"keys": [("school_id", ASCENDING), ("email", ASCENDING)], "unique": True, "name": "idx_school_email_unique"},
                {"keys": [("school_id", ASCENDING), ("role", ASCENDING)], "name": "idx_school_role"},
                {"keys": [("phone", ASCENDING)], "sparse": True, "name": "idx_user_phone"},
            ]
        },
        
        # Students Collection
        {
            "collection": "students",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_student_school"},
                {"keys": [("school_id", ASCENDING), ("roll_number", ASCENDING)], "unique": True, "name": "idx_school_roll"},
                {"keys": [("school_id", ASCENDING), ("email", ASCENDING)], "sparse": True, "name": "idx_school_student_email"},
                {"keys": [("school_id", ASCENDING), ("class_id", ASCENDING)], "name": "idx_school_class"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_student_created"},
            ]
        },
        
        # Teachers Collection
        {
            "collection": "teachers",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_teacher_school"},
                {"keys": [("school_id", ASCENDING), ("email", ASCENDING)], "unique": True, "name": "idx_school_teacher_email"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_teacher_created"},
            ]
        },
        
        # Classes Collection
        {
            "collection": "classes",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_class_school"},
                {"keys": [("school_id", ASCENDING), ("name", ASCENDING)], "unique": True, "name": "idx_school_class_name"},
                {"keys": [("school_id", ASCENDING), ("section", ASCENDING)], "name": "idx_school_section"},
            ]
        },
        
        # Subjects Collection
        {
            "collection": "subjects",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_subject_school"},
                {"keys": [("school_id", ASCENDING), ("name", ASCENDING)], "unique": True, "name": "idx_school_subject_name"},
            ]
        },
        
        # Grades Collection
        {
            "collection": "grades",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_grade_school"},
                {"keys": [("school_id", ASCENDING), ("student_id", ASCENDING)], "name": "idx_school_student_grades"},
                {"keys": [("school_id", ASCENDING), ("term", ASCENDING)], "name": "idx_school_term"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_grade_created"},
            ]
        },
        
        # Fees Collection
        {
            "collection": "fees",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_fee_school"},
                {"keys": [("school_id", ASCENDING), ("name", ASCENDING)], "unique": True, "name": "idx_school_fee_name"},
            ]
        },
        
        # Fee Categories Collection
        {
            "collection": "fee_categories",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_fee_category_school"},
                {"keys": [("school_id", ASCENDING), ("name", ASCENDING)], "unique": True, "name": "idx_school_category_name"},
            ]
        },
        
        # Fee Payments Collection
        {
            "collection": "fee_payments",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_fee_payment_school"},
                {"keys": [("school_id", ASCENDING), ("student_id", ASCENDING)], "name": "idx_school_student_payments"},
                {"keys": [("school_id", ASCENDING), ("paid_at", DESCENDING)], "name": "idx_school_payment_date"},
                {"keys": [("school_id", ASCENDING), ("received_by", ASCENDING)], "name": "idx_school_accountant"},
            ]
        },
        
        # Class Fee Assignments Collection
        {
            "collection": "class_fee_assignments",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_class_fee_school"},
                {"keys": [("school_id", ASCENDING), ("class_id", ASCENDING)], "name": "idx_school_class_fees"},
                {"keys": [("school_id", ASCENDING), ("fee_category_id", ASCENDING)], "name": "idx_school_category_assignments"},
            ]
        },
        
        # Chalans Collection
        {
            "collection": "chalans",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_chalan_school"},
                {"keys": [("school_id", ASCENDING), ("student_id", ASCENDING)], "name": "idx_school_student_chalans"},
                {"keys": [("school_id", ASCENDING), ("class_id", ASCENDING)], "name": "idx_school_class_chalans"},
            ]
        },
        
        # Payments Collection
        {
            "collection": "payments",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_payment_school"},
                {"keys": [("school_id", ASCENDING), ("student_id", ASCENDING)], "name": "idx_school_student_transaction"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_payment_created"},
            ]
        },
        
        # Payment Methods Collection
        {
            "collection": "payment_methods",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_payment_method_school"},
                {"keys": [("school_id", ASCENDING), ("name", ASCENDING)], "unique": True, "name": "idx_school_method_name"},
            ]
        },
        
        # Accountant Profiles Collection
        {
            "collection": "accountant_profiles",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_accountant_school"},
                {"keys": [("school_id", ASCENDING), ("user_id", ASCENDING)], "unique": True, "name": "idx_school_accountant_user"},
            ]
        },
        
        # Accountant Daily Summaries Collection
        {
            "collection": "accountant_daily_summaries",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_daily_summary_school"},
                {"keys": [("school_id", ASCENDING), ("accountant_id", ASCENDING)], "name": "idx_school_accountant_summary"},
                {"keys": [("school_id", ASCENDING), ("date", DESCENDING)], "name": "idx_school_summary_date"},
            ]
        },
        
        # Accountant Transactions Collection
        {
            "collection": "accountant_transactions",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_transaction_school"},
                {"keys": [("school_id", ASCENDING), ("accountant_id", ASCENDING)], "name": "idx_school_accountant_transactions"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_transaction_created"},
            ]
        },
        
        # Notifications Collection
        {
            "collection": "notifications",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_notification_school"},
                {"keys": [("school_id", ASCENDING), ("user_email", ASCENDING)], "name": "idx_school_user_notifications"},
                {"keys": [("school_id", ASCENDING), ("created_at", DESCENDING)], "name": "idx_school_notification_created"},
            ]
        },
        
        # Import Logs Collection
        {
            "collection": "import_logs",
            "indexes": [
                {"keys": [("school_id", ASCENDING)], "name": "idx_import_log_school"},
                {"keys": [("school_id", ASCENDING), ("status", ASCENDING)], "name": "idx_school_import_status"},
                {"keys": [("school_id", ASCENDING), ("timestamp", DESCENDING)], "name": "idx_school_import_date"},
            ]
        },
    ]
    
    created_count = 0
    failed_count = 0
    
    print("=" * 80)
    print("MongoDB Indexes Creation")
    print("=" * 80)
    
    for config in indexes_config:
        collection_name = config["collection"]
        collection = db[collection_name]
        
        print(f"\n📦 Collection: {collection_name}")
        
        for index_config in config["indexes"]:
            keys = index_config["keys"]
            index_name = index_config.get("name", "")
            
            try:
                # Create index with options
                options = {"name": index_name}
                if index_config.get("unique"):
                    options["unique"] = True
                if index_config.get("sparse"):
                    options["sparse"] = True
                
                collection.create_index(keys, **options)
                print(f"   ✅ {index_name}")
                created_count += 1
            except OperationFailure as e:
                print(f"   ⚠️  {index_name} - {str(e)}")
                failed_count += 1
            except Exception as e:
                print(f"   ❌ {index_name} - {str(e)}")
                failed_count += 1
    
    print("\n" + "=" * 80)
    print(f"✅ Indexes Creation Complete")
    print(f"   Created: {created_count} | Failed/Skipped: {failed_count}")
    print("=" * 80)

if __name__ == "__main__":
    create_indexes()
