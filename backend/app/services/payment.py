from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)


def record_payment(payment_data: dict, school_id: str = None) -> Optional[dict]:
    db = get_db()

    if not school_id:
        logger.error(f"❌ Cannot record payment without schoolId")
        return None

    payment_data["school_id"] = school_id
    payment_data["created_at"] = datetime.utcnow()
    payment_data["paid_at"] = payment_data.get("paid_at", datetime.utcnow())

    result = db.payments.insert_one(payment_data)
    payment_data["_id"] = str(result.inserted_id)

    # Update fee status based on payments sum
    fee_id = payment_data.get("fee_id")
    if fee_id:
        try:
            fee_query = {"_id": ObjectId(fee_id)}
            if school_id:
                fee_query["school_id"] = school_id
            fee = db.fees.find_one(fee_query)
            if fee:
                paid_sum = 0.0
                payment_query = {"fee_id": fee_id}
                if school_id:
                    payment_query["school_id"] = school_id
                for p in db.payments.find(payment_query):
                    paid_sum += float(p.get("amount", 0))
                amount = float(fee.get("amount", 0))
                new_status = "partial"
                if paid_sum >= amount:
                    new_status = "paid"
                db.fees.update_one({"_id": fee["_id"]}, {"$set": {"status": new_status, "paid_at": datetime.utcnow() if new_status == "paid" else fee.get("paid_at")}})
        except Exception:
            pass

    logger.info(f"[SCHOOL:{school_id}] ✅ Payment recorded: {payment_data.get('_id')}")
    return payment_data


def get_payments(filters: dict = None, school_id: str = None) -> List[dict]:
    db = get_db()
    query = filters or {}
    if school_id:
        query["school_id"] = school_id
        logger.info(f"[SCHOOL:{school_id}] Fetching payments")
    payments = list(db.payments.find(query))
    for p in payments:
        p["id"] = str(p["_id"])
    if school_id:
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(payments)} payments")
    return payments


def get_payment_by_id(payment_id: str, school_id: str = None) -> Optional[dict]:
    db = get_db()
    try:
        query = {"_id": ObjectId(payment_id)}
        if school_id:
            query["school_id"] = school_id
        p = db.payments.find_one(query)
        if p:
            p["id"] = str(p["_id"])
        return p
    except Exception:
        return None
