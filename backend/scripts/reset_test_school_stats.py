"""
One-time script to fully reset accounting statistics for a test school.
Usage: python reset_test_school_stats.py [email]
Default email: test@school

Actions performed (one-time, destructive):
- Delete `student_payments` for the school
- Delete `principal_payments` (admin/principal payments) for the school
- Delete `accountant_ledger` entries for the school
- Delete `daily_audit_log` entries for the school
- Zero and/or set `accounting_sessions` and `cash_sessions` fields to 0 and `status: OPEN`

Run only for test data. This is destructive: it removes payment and ledger history for the school.
"""
import sys
import os
from pymongo import MongoClient
# Ensure backend package importable
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
from app.config import settings
from datetime import datetime

DEFAULT_EMAIL = "test@school"


def get_client():
    uri = settings.mongo_uri
    client = MongoClient(uri, serverSelectionTimeoutMS=30000)
    client.admin.command("ping")
    return client


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL
    client = get_client()

    saas_db = client["saas_root_db"]
    user = saas_db.global_users.find_one({"email": email})

    if not user:
        print(f"❌ No global user found with email: {email}")
        return

    school_id = user.get("school_id")
    database_name = user.get("database_name")

    if not school_id or not database_name:
        print(f"❌ User {email} does not have school_id or database_name set.\nUser doc: {user}")
        return

    print(f"ℹ️ Found user {email} -> school_id: {school_id}, database: {database_name}")

    school_db = client[database_name]

    # --- Delete payments and related history ---
    sp_res = school_db.student_payments.delete_many({"school_id": school_id})
    print(f"✅ Deleted {sp_res.deleted_count} student_payments")

    # principal_payments (may be named principal_payments or admin_payments)
    pp_deleted = 0
    if "principal_payments" in school_db.list_collection_names():
        res = school_db.principal_payments.delete_many({"school_id": school_id})
        pp_deleted = res.deleted_count
    if pp_deleted == 0 and "admin_payments" in school_db.list_collection_names():
        res = school_db.admin_payments.delete_many({"school_id": school_id})
        pp_deleted = res.deleted_count
    print(f"✅ Deleted {pp_deleted} principal/admin payment docs (if present)")

    # accountant_ledger
    al_res = school_db.accountant_ledger.delete_many({"school_id": school_id})
    print(f"✅ Deleted {al_res.deleted_count} accountant_ledger entries")

    # daily_audit_log
    dal_res = school_db.daily_audit_log.delete_many({"school_id": school_id})
    print(f"✅ Deleted {dal_res.deleted_count} daily_audit_log entries")

    # Optionally remove any aggregated summary documents (daily_workflow) for the school
    if "daily_workflow" in school_db.list_collection_names():
        dw_res = school_db.daily_workflow.delete_many({"school_id": school_id})
        print(f"✅ Deleted {dw_res.deleted_count} daily_workflow documents")
    else:
        print("ℹ️ No daily_workflow collection present or skipped")

    # --- Zero session documents ---
    update = {
        "$set": {
            "opening_balance": 0.0,
            "closing_balance": 0.0,
            "total_collected": 0.0,
            "total_collected_today": 0.0,
            "total_paid_to_admin": 0.0,
            "total_paid_to_principal": 0.0,
            "total_paid": 0.0,
            "current_balance": 0.0,
            "closing_balance_by_method": {},
            "opening_balance_by_method": {},
            "closing_balance_by_method": {},
            "status": "OPEN",
            "updated_at": datetime.utcnow()
        }
    }

    acc_res = school_db.accounting_sessions.update_many({"school_id": school_id}, update)
    print(f"✅ Updated {acc_res.modified_count} accounting_sessions")

    cash_res = school_db.cash_sessions.update_many({"school_id": school_id}, update)
    print(f"✅ Updated {cash_res.modified_count} cash_sessions")

    # --- Optional: reset school-level aggregates in saas_root_db.schools document ---
    try:
        root_update = {"$set": {"last_stats_update": None}}
        saas_db.schools.update_many({"school_id": school_id}, root_update)
        print("✅ Cleared school-level last_stats_update flag (if present)")
    except Exception:
        print("ℹ️ Skipped root DB school update")

    print("\nDone. Accounting data for the school has been reset. Please reload the app and verify the dashboards.")


if __name__ == "__main__":
    main()
