from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId

# ================= Fee Operations =================

def create_fee(fee_data: dict) -> Optional[dict]:
    """Create a new fee"""
    db = get_db()

    fee_data["created_at"] = datetime.utcnow()

    result = db.fees.insert_one(fee_data)
    fee_data["_id"] = str(result.inserted_id)
    return fee_data

def get_all_fees(filters: dict = None) -> list:
    """Get all fees with optional filters"""
    db = get_db()
    query = filters or {}
    fees = list(db.fees.find(query))
    for fee in fees:
        fee["id"] = str(fee["_id"])
    return fees

def get_fee_by_id(fee_id: str) -> Optional[dict]:
    """Get fee by ID"""
    db = get_db()
    try:
        fee = db.fees.find_one({"_id": ObjectId(fee_id)})
        if fee:
            fee["id"] = str(fee["_id"])
        return fee
    except:
        return None

def update_fee(fee_id: str, **kwargs) -> Optional[dict]:
    """Update fee"""
    db = get_db()
    try:
        result = db.fees.find_one_and_update(
            {"_id": ObjectId(fee_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None

def delete_fee(fee_id: str) -> bool:
    """Delete fee"""
    db = get_db()
    try:
        result = db.fees.delete_one({"_id": ObjectId(fee_id)})
        return result.deleted_count > 0
    except:
        return False

def get_fees_by_student(student_id: str) -> list:
    """Get all fees for a specific student"""
    db = get_db()
    fees = list(db.fees.find({"student_id": student_id}))
    for fee in fees:
        fee["id"] = str(fee["_id"])
    return fees