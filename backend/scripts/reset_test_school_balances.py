"""
One-time script to reset opening/closing and session balances for a school's accounting sessions.
Usage: python reset_test_school_balances.py [email]
If no email is provided, defaults to "test@school".

This script will:
- Find the global user by email in `saas_root_db.global_users` to get `school_id` and `database_name`.
- Update all documents in the school's `accounting_sessions` collection to zero out opening/closing/collected/paid fields.
- Optionally set session `status` to "OPEN" so testing can start fresh.

Run once and verify in the app.
"""
import sys
import os
from pymongo import MongoClient
# Ensure backend package is importable
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

    # Update accounting sessions
    update = {
        "$set": {
            "opening_balance": 0.0,
            "closing_balance": 0.0,
            "total_collected": 0.0,
            "total_paid_to_admin": 0.0,
            "total_paid_to_principal": 0.0,
            "total_paid": 0.0,
            "status": "OPEN",
            "updated_at": datetime.utcnow()
        }
    }

    result_acc = school_db.accounting_sessions.update_many({"school_id": school_id}, update)
    print(f"✅ Updated {result_acc.modified_count} accounting_sessions for school {school_id}")

    # Reset cash_sessions as well (cash session APIs use this collection)
    result_cash = school_db.cash_sessions.update_many({"school_id": school_id}, update)
    print(f"✅ Updated {result_cash.modified_count} cash_sessions for school {school_id}")

    # Also clear aggregate fields in daily_workflow or related collections if present
    # e.g., reset any school-level daily summary doc if exists
    try:
        summary_result = school_db.daily_workflow.update_many({"school_id": school_id}, update)
        print(f"✅ Updated {summary_result.modified_count} daily_workflow documents (if any)")
    except Exception:
        print("ℹ️ No daily_workflow collection or update skipped")

    print("\nDone. Please verify in the app or run quick queries against the DB to confirm values are zeroed.")


if __name__ == "__main__":
    main()
