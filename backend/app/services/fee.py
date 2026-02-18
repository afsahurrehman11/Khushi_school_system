from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Fee Operations =================

def create_fee(fee_data: dict, school_id: str = None) -> Optional[dict]:
    """Create a new fee"""
    db = get_db()

    if not school_id:
        logger.error(f"❌ Cannot create fee without schoolId")
        return None

    fee_data["school_id"] = school_id
    fee_data["created_at"] = datetime.utcnow()

    result = db.fees.insert_one(fee_data)
    fee_data["_id"] = str(result.inserted_id)
    logger.info(f"[SCHOOL:{school_id}] ✅ Fee created for student {fee_data.get('student_id')}")
    return fee_data

def get_all_fees(filters: dict = None, school_id: str = None) -> list:
    """Get all fees with optional filters"""
    db = get_db()
    query = filters or {}
    if school_id:
        query["school_id"] = school_id
        logger.info(f"[SCHOOL:{school_id}] Fetching fees")
    fees = list(db.fees.find(query))
    for fee in fees:
        fee["id"] = str(fee["_id"])
    if school_id:
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(fees)} fees")
    return fees

def get_fee_by_id(fee_id: str, school_id: str = None) -> Optional[dict]:
    """Get fee by ID"""
    db = get_db()
    try:
        query = {"_id": ObjectId(fee_id)}
        if school_id:
            query["school_id"] = school_id
        fee = db.fees.find_one(query)
        if fee:
            fee["id"] = str(fee["_id"])
        return fee
    except:
        return None

def update_fee(fee_id: str, school_id: str = None, **kwargs) -> Optional[dict]:
    """Update fee"""
    db = get_db()
    try:
        query = {"_id": ObjectId(fee_id)}
        if school_id:
            query["school_id"] = school_id
        result = db.fees.find_one_and_update(
            query,
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
            if school_id:
                logger.info(f"[SCHOOL:{school_id}] ✅ Fee {fee_id} updated")
        elif school_id:
            logger.warning(f"[SCHOOL:{school_id}] Fee {fee_id} not found")
        return result
    except Exception as e:
        if school_id:
            logger.error(f"[SCHOOL:{school_id}] Failed to update fee: {str(e)}")
        return None

def delete_fee(fee_id: str, school_id: str = None) -> bool:
    """Delete fee"""
    db = get_db()
    try:
        query = {"_id": ObjectId(fee_id)}
        if school_id:
            query["school_id"] = school_id
        result = db.fees.delete_one(query)
        if school_id and result.deleted_count > 0:
            logger.info(f"[SCHOOL:{school_id}] ✅ Fee {fee_id} deleted")
        return result.deleted_count > 0
    except:
        return False

def get_fees_by_student(student_id: str, school_id: str = None) -> list:
    """Get all fees for a specific student"""
    db = get_db()
    query = {"student_id": student_id}
    if school_id:
        query["school_id"] = school_id
    fees = list(db.fees.find(query))
    for fee in fees:
        fee["id"] = str(fee["_id"])
    return fees