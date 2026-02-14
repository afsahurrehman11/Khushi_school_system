from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId


def record_payment(payment_data: dict) -> Optional[dict]:
    db = get_db()

    payment_data["created_at"] = datetime.utcnow()
    payment_data["paid_at"] = payment_data.get("paid_at", datetime.utcnow())

    result = db.payments.insert_one(payment_data)
    payment_data["_id"] = str(result.inserted_id)

    # Update fee status based on payments sum
    fee_id = payment_data.get("fee_id")
    if fee_id:
        try:
            fee = db.fees.find_one({"_id": ObjectId(fee_id)})
            if fee:
                paid_sum = 0.0
                for p in db.payments.find({"fee_id": fee_id}):
                    paid_sum += float(p.get("amount", 0))
                amount = float(fee.get("amount", 0))
                new_status = "partial"
                if paid_sum >= amount:
                    new_status = "paid"
                db.fees.update_one({"_id": fee["_id"]}, {"$set": {"status": new_status, "paid_at": datetime.utcnow() if new_status == "paid" else fee.get("paid_at")}})
        except Exception:
            pass

    return payment_data


def get_payments(filters: dict = None) -> List[dict]:
    db = get_db()
    query = filters or {}
    payments = list(db.payments.find(query))
    for p in payments:
        p["id"] = str(p["_id"])
    return payments


def get_payment_by_id(payment_id: str) -> Optional[dict]:
    db = get_db()
    try:
        p = db.payments.find_one({"_id": ObjectId(payment_id)})
        if p:
            p["id"] = str(p["_id"])
        return p
    except Exception:
        return None
