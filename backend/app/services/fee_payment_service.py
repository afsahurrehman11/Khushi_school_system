from app.database import get_db
from datetime import datetime
from typing import Optional, List, Dict
from bson.objectid import ObjectId
from app.services.accountant_service import update_accountant_balance
from app.services.payment_method_service import create_or_get_payment_method

# ================= Fee Payment Operations =================

def record_fee_payment(data: dict) -> Optional[dict]:
    """Record a fee payment for a student"""
    db = get_db()
    
    payment = {
        "student_id": data.get("student_id"),
        "class_id": data.get("class_id"),
        "amount_paid": data.get("amount_paid"),
        "payment_method": data.get("payment_method"),  # cash, bank_transfer, online
        "transaction_reference": data.get("transaction_reference"),
        "remarks": data.get("remarks"),
        "received_by": data.get("received_by"),  # User ID
        "paid_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    
    result = db.fee_payments.insert_one(payment)
    payment["id"] = str(result.inserted_id)
    
    # Update accountant balance
    received_by = data.get("received_by")
    amount = data.get("amount_paid", 0)
    if received_by and amount > 0:
        update_accountant_balance(
            user_id=received_by,
            amount=amount,
            type_="collection",
            description=f"Fee payment from student {data.get('student_id')}",
            recorded_by=received_by
        )
    
    # Persist non-cash payment method name for reuse (non-critical)
    pm = data.get("payment_method")
    if pm and pm.lower() != 'cash':
        try:
            create_or_get_payment_method(pm)
        except Exception:
            pass

    return payment

def get_fee_payment_by_id(payment_id: str) -> Optional[dict]:
    """Get fee payment by ID"""
    db = get_db()
    try:
        payment = db.fee_payments.find_one({"_id": ObjectId(payment_id)})
        if payment:
            payment["id"] = str(payment["_id"])
        return payment
    except:
        return None

def get_fee_payments_for_student(student_id: str) -> List[dict]:
    """Get all fee payments for a specific student"""
    db = get_db()
    
    payments = list(db.fee_payments.find({"student_id": student_id}).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def get_fee_payments_for_class(class_id: str) -> List[dict]:
    """Get all fee payments for a specific class"""
    db = get_db()
    
    payments = list(db.fee_payments.find({"class_id": class_id}).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def get_all_fee_payments(filters: Dict = None) -> List[dict]:
    """Get all fee payments with optional filters"""
    db = get_db()
    
    query = {}
    if filters:
        if "student_id" in filters:
            query["student_id"] = filters["student_id"]
        if "class_id" in filters:
            query["class_id"] = filters["class_id"]
        if "payment_method" in filters:
            query["payment_method"] = filters["payment_method"]
    
    payments = list(db.fee_payments.find(query).sort("paid_at", -1))
    for payment in payments:
        payment["id"] = str(payment["_id"])
    return payments

def update_fee_payment(payment_id: str, update_data: dict) -> Optional[dict]:
    """Update a fee payment"""
    db = get_db()
    
    update_dict = {"updated_at": datetime.utcnow()}
    for key in ["amount_paid", "payment_method", "transaction_reference", "remarks"]:
        if key in update_data:
            update_dict[key] = update_data[key]
    
    try:
        result = db.fee_payments.update_one(
            {"_id": ObjectId(payment_id)},
            {"$set": update_dict}
        )
        if result.modified_count > 0:
            return get_fee_payment_by_id(payment_id)
        return None
    except:
        return None

def delete_fee_payment(payment_id: str) -> bool:
    """Delete a fee payment"""
    db = get_db()
    
    try:
        result = db.fee_payments.delete_one({"_id": ObjectId(payment_id)})
        return result.deleted_count > 0
    except:
        return False

def get_fee_payment_summary_for_student(student_id: str) -> Dict:
    """Get payment summary for a student"""
    db = get_db()
    
    # Get assigned fee category for student's class
    student = db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        return {"total_fee": 0, "paid_amount": 0, "remaining_amount": 0, "status": "unknown"}
    
    class_id = student.get("class_id")
    if not class_id:
        return {"total_fee": 0, "paid_amount": 0, "remaining_amount": 0, "status": "no_class"}
    
    # Get active fee category for class
    assignment = db.class_fee_assignments.find_one({
        "class_id": class_id,
        "is_active": True
    })
    
    total_fee = 0
    if assignment:
        category = db.fee_categories.find_one({"_id": ObjectId(assignment["category_id"])})
        if category:
            # fee categories may store components; compute total if needed
            if "total_amount" in category and isinstance(category.get("total_amount"), (int, float)):
                total_fee = category.get("total_amount", 0)
            elif isinstance(category.get("components"), list):
                total_fee = sum((comp.get("amount", 0) for comp in category.get("components", [])))
            else:
                # fallback to category snapshots if any
                snapshot = db.category_snapshots.find_one({"category_id": str(category.get("_id"))}, sort=[("snapshot_date", -1)])
                if snapshot:
                    total_fee = snapshot.get("total_amount", 0)
    
    # Sum all payments for this student
    pipeline = [
        {"$match": {"student_id": student_id}},
        {"$group": {"_id": None, "total_paid": {"$sum": "$amount_paid"}}}
    ]
    result = list(db.fee_payments.aggregate(pipeline))
    paid_amount = result[0]["total_paid"] if result else 0
    
    remaining_amount = total_fee - paid_amount
    
    # Determine status
    if paid_amount == 0:
        status = "unpaid"
    elif paid_amount >= total_fee:
        status = "paid"
    else:
        status = "partial"
    
    return {
        "total_fee": total_fee,
        "paid_amount": paid_amount,
        "remaining_amount": max(0, remaining_amount),
        "status": status
    }