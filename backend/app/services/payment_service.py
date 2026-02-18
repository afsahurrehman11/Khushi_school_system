from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Payment Operations =================

def record_payment(data: dict, school_id: str = None) -> Optional[dict]:
    """Record a payment for a challan"""
    db = get_db()
    
    if not school_id:
        logger.error(f"❌ Cannot record payment without schoolId")
        return None
    
    payment = {
        "challan_id": data.get("challan_id"),
        "student_id": data.get("student_id"),
        "amount_paid": data.get("amount_paid"),
        "payment_method": data.get("payment_method"),  # cash, online, check, etc.
        "transaction_reference": data.get("transaction_reference"),
        "received_by": data.get("received_by"),  # User ID
        "school_id": school_id,
        "paid_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.payments.insert_one(payment)
    payment["id"] = str(result.inserted_id)
    
    # Update challan status
    _update_challan_status(data.get("challan_id"), school_id)
    
    logger.info(f"[SCHOOL:{school_id}] ✅ Payment recorded: {payment.get('id')}")
    return payment

def get_payment_by_id(payment_id: str, school_id: str = None) -> Optional[dict]:
    """Get payment by ID"""
    db = get_db()
    try:
        query = {"_id": ObjectId(payment_id)}
        if school_id:
            query["school_id"] = school_id
        payment = db.payments.find_one(query)
        if payment:
            payment["id"] = str(payment["_id"])
        return payment
    except:
        return None

def get_payments_for_challan(challan_id: str, school_id: str = None) -> List[dict]:
    """Get all payments for a specific challan"""
    db = get_db()
    
    query = {"challan_id": challan_id}
    if school_id:
        query["school_id"] = school_id
    payments = list(db.payments.find(query).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def get_payments_for_student(student_id: str, school_id: str = None) -> List[dict]:
    """Get all payments for a student"""
    db = get_db()
    
    query = {"student_id": student_id}
    if school_id:
        query["school_id"] = school_id
    payments = list(db.payments.find(query).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def get_all_payments(filters: dict = None, school_id: str = None) -> List[dict]:
    """Get all payments with optional filters"""
    db = get_db()
    query = filters or {}
    if school_id:
        query["school_id"] = school_id
        logger.info(f"[SCHOOL:{school_id}] Fetching payments")
    
    payments = list(db.payments.find(query).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def update_payment(payment_id: str, data: dict, school_id: str = None) -> Optional[dict]:
    """Update payment details"""
    db = get_db()
    try:
        oid = ObjectId(payment_id)
    except:
        return None
    
    update = {}
    if "amount_paid" in data:
        update["amount_paid"] = data["amount_paid"]
    if "payment_method" in data:
        update["payment_method"] = data["payment_method"]
    if "transaction_reference" in data:
        update["transaction_reference"] = data["transaction_reference"]
    
    update["updated_at"] = datetime.utcnow()
    
    query = {"_id": oid}
    if school_id:
        query["school_id"] = school_id
    
    result = db.payments.find_one_and_update(
        query,
        {"$set": update},
        return_document=True
    )
    
    if result:
        result["id"] = str(result["_id"])
        # Update challan status after payment update
        _update_challan_status(result.get("challan_id"), school_id)
        if school_id:
            logger.info(f"[SCHOOL:{school_id}] ✅ Payment {payment_id} updated")
    
    return result

def delete_payment(payment_id: str, school_id: str = None) -> bool:
    """Delete a payment"""
    db = get_db()
    try:
        query = {"_id": ObjectId(payment_id)}
        if school_id:
            query["school_id"] = school_id
        payment = db.payments.find_one(query)
        if not payment:
            return False
        
        result = db.payments.delete_one(query)
        
        # Update challan status after payment deletion
        if payment:
            _update_challan_status(payment.get("challan_id"), school_id)
        
        if school_id and result.deleted_count > 0:
            logger.info(f"[SCHOOL:{school_id}] ✅ Payment {payment_id} deleted")
        return result.deleted_count > 0
    except:
        return False

def _update_challan_status(challan_id: str, school_id: str = None) -> Optional[dict]:
    """Recalculate and update challan status based on payments (SYSTEM CALCULATED)"""
    db = get_db()
    
    try:
        query = {"_id": ObjectId(challan_id)}
        if school_id:
            query["school_id"] = school_id
        challan = db.student_challans.find_one(query)
        if not challan:
            return None
        
        # Get all payments for this challan
        payment_query = {"challan_id": challan_id}
        if school_id:
            payment_query["school_id"] = school_id
        payments = list(db.payments.find(payment_query))
        total_paid = sum(p.get("amount_paid", 0) for p in payments)
        
        total_amount = challan.get("total_amount", 0)
        remaining_amount = max(0, total_amount - total_paid)
        
        # Determine status
        if remaining_amount == 0:
            status = "paid"
        elif total_paid > 0:
            status = "partial"
        else:
            status = "unpaid"
        
        last_payment = None
        if payments:
            last_payment = max(p.get("paid_at") for p in payments)
        
        # Update challan
        update = {
            "paid_amount": min(total_paid, total_amount),
            "remaining_amount": remaining_amount,
            "status": status,
            "last_payment_date": last_payment,
            "updated_at": datetime.utcnow(),
        }
        
        result = db.student_challans.find_one_and_update(
            query,
            {"$set": update},
            return_document=True
        )
        
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None

def get_payment_summary_for_student(student_id: str, school_id: str = None) -> dict:
    """Get payment summary for a student"""
    db = get_db()
    
    # Get all challans for student
    query = {"student_id": student_id}
    if school_id:
        query["school_id"] = school_id
    challans = list(db.student_challans.find(query))
    
    total_fee = 0
    total_paid = 0
    total_remaining = 0
    
    for challan in challans:
        total_fee += challan.get("total_amount", 0)
        total_paid += challan.get("paid_amount", 0)
        total_remaining += challan.get("remaining_amount", 0)
    
    return {
        "student_id": student_id,
        "total_fee": total_fee,
        "total_paid": total_paid,
        "total_remaining": total_remaining,
        "num_challans": len(challans),
        "paid_status": _calculate_overall_status(total_paid, total_fee),
    }

def _calculate_overall_status(paid: float, total: float) -> str:
    """Calculate overall payment status"""
    if total == 0:
        return "unpaid"
    if paid == 0:
        return "unpaid"
    if paid >= total:
        return "paid"
    return "partial"
