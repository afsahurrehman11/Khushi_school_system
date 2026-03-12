"""
Student Monthly Fee Service - M2, M3, M4 Implementation
Handles scholarship, monthly fee generation, and payment processing
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from bson import ObjectId
import logging
import calendar
import traceback

from app.database import get_db
from app.models.student_monthly_fee import (
    FeeStatus, StudentMonthlyFeeCreate, StudentMonthlyFeeInDB,
    StudentMonthlyFeeResponse, MonthlyFeeSummary, MonthlyFeeBreakdown,
    PaymentMethod, StudentPaymentCreate, StudentPaymentInDB,
    StudentPaymentResponse, PaymentSummary
)

logger = logging.getLogger(__name__)

# Simple in-memory cache for class assignments and fee categories
_svc_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_MS = 5 * 60 * 1000  # 5 minutes

def _cache_get(key: str):
    entry = _svc_cache.get(key)
    if not entry:
        return None
    if entry.get("expiry", 0) < int(datetime.utcnow().timestamp() * 1000):
        try:
            del _svc_cache[key]
        except KeyError:
            pass
        return None
    return entry.get("value")

def _cache_set(key: str, value: Any, ttl_ms: int = _CACHE_TTL_MS):
    _svc_cache[key] = {"value": value, "expiry": int(datetime.utcnow().timestamp() * 1000) + int(ttl_ms)}

# ==================== HELPER FUNCTIONS ====================

def get_month_name(month: int) -> str:
    """Get month name from month number"""
    return calendar.month_name[month]

def convert_objectid(doc: dict) -> dict:
    """Convert MongoDB document ObjectId to string"""
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


def _convert_bson_recursive(obj):
    """Recursively convert BSON types (ObjectId) to JSON-friendly types."""
    if obj is None:
        return None
    # Convert single ObjectId
    if isinstance(obj, ObjectId):
        return str(obj)
    # Dict -> convert values
    if isinstance(obj, dict):
        new = {}
        for k, v in obj.items():
            new[k] = _convert_bson_recursive(v)
        return new
    # List/tuple -> convert items
    if isinstance(obj, (list, tuple)):
        return [_convert_bson_recursive(v) for v in obj]
    # Other types (datetime, str, int, float, bool) pass through
    return obj

# ==================== SCHOLARSHIP SERVICE (M2) ====================

def get_student_scholarship(student_id: str, school_id: str) -> Dict[str, Any]:
    """Get student's current scholarship percentage and arrears balance"""
    db = get_db()
    student = db.students.find_one({
        "_id": ObjectId(student_id) if ObjectId.is_valid(student_id) else None,
        "school_id": school_id
    })
    
    if not student:
        # Try with student_id field
        student = db.students.find_one({
            "student_id": student_id,
            "school_id": school_id
        })
    
    if not student:
        return None
    
    return {
        "student_id": str(student.get("_id")),
        "scholarship_percent": student.get("scholarship_percent", 0.0),
        "arrears_balance": student.get("arrears_balance", student.get("arrears", 0.0))
    }

def update_student_scholarship(student_id: str, school_id: str, scholarship_percent: float) -> bool:
    """Update student's scholarship percentage"""
    db = get_db()
    
    if not 0 <= scholarship_percent <= 100:
        raise ValueError("Scholarship percent must be between 0 and 100")
    
    # Try ObjectId first
    query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        query["_id"] = ObjectId(student_id)
    else:
        query["student_id"] = student_id
    
    result = db.students.update_one(
        query,
        {
            "$set": {
                "scholarship_percent": scholarship_percent,
                "updated_at": datetime.utcnow()
            }
        }
    )
    # If update succeeded, also update current month's fee record (if exists)
    if result.modified_count > 0:
        try:
            # Determine student _id for fee queries
            student_obj_id = None
            if ObjectId.is_valid(student_id):
                student_obj_id = ObjectId(student_id)
            else:
                s = db.students.find_one({"student_id": student_id, "school_id": school_id})
                if s:
                    student_obj_id = s.get("_id")

            if student_obj_id:
                now = datetime.utcnow()
                fee = db.student_monthly_fees.find_one({
                    "school_id": school_id,
                    "student_id": str(student_obj_id),
                    "month": now.month,
                    "year": now.year
                })
                if fee:
                    # Recompute scholarship-related fields while preserving payments
                    base_fee = fee.get("base_fee", 0)
                    arrears_added = fee.get("arrears_added", 0)
                    amount_paid = fee.get("amount_paid", 0)

                    scholarship_amount = round((base_fee * scholarship_percent) / 100.0, 2)
                    fee_after_discount = base_fee - scholarship_amount
                    final_fee = fee_after_discount + (arrears_added or 0)
                    remaining_amount = final_fee - (amount_paid or 0)

                    new_status = FeeStatus.UNPAID.value
                    if remaining_amount <= 0:
                        new_status = FeeStatus.PAID.value
                        remaining_amount = 0.0
                    elif amount_paid and amount_paid > 0:
                        new_status = FeeStatus.PARTIAL.value

                    db.student_monthly_fees.update_one(
                        {"_id": fee["_id"]},
                        {"$set": {
                            "scholarship_percent": scholarship_percent,
                            "scholarship_amount": scholarship_amount,
                            "fee_after_discount": fee_after_discount,
                            "final_fee": final_fee,
                            "remaining_amount": remaining_amount,
                            "status": new_status,
                            "updated_at": datetime.utcnow()
                        }}
                    )

                    # Recompute student's arrears after changing scholarship
                    try:
                        sid = str(student_obj_id)
                        new_arrears = compute_student_arrears_balance(sid, school_id)
                        update_student_arrears(sid, school_id, new_arrears)
                    except Exception:
                        pass
        except Exception:
            logger.exception("Failed to recompute current month fee after scholarship update")

    return result.modified_count > 0

def update_student_arrears(student_id: str, school_id: str, arrears_balance: float) -> bool:
    """Update student's arrears balance"""
    db = get_db()
    
    query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        query["_id"] = ObjectId(student_id)
    else:
        query["student_id"] = student_id
    
    result = db.students.update_one(
        query,
        {
            "$set": {
                "arrears_balance": arrears_balance,
                "arrears": arrears_balance,  # Keep legacy field in sync
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return result.modified_count > 0


def compute_student_arrears_balance(student_id: str, school_id: str) -> float:
    """Recompute student's arrears balance from monthly fee records.

    Arrears are defined as the sum of remaining amounts for previous months
    (months earlier than the current month) and any fees marked OVERDUE.
    This ensures arrears always reflect the accurate outstanding history.
    """
    db = get_db()
    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year

    query = {
        "school_id": school_id,
        "student_id": student_id,
        "remaining_amount": {"$gt": 0},
        "$or": [
            {"year": {"$lt": current_year}},
            {"year": current_year, "month": {"$lt": current_month}},
            {"status": FeeStatus.OVERDUE.value}
        ]
    }

    fees = list(db.student_monthly_fees.find(query))
    total = 0.0
    for f in fees:
        total += f.get("remaining_amount", 0)

    return float(total)

# ==================== MONTHLY FEE SERVICE (M3) ====================

def get_student_base_fee(student_id: str, school_id: str) -> float:
    """Get student's base fee from class fee assignment"""
    db = get_db()
    
    # Get student
    query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        query["_id"] = ObjectId(student_id)
    else:
        query["student_id"] = student_id
    
    student = db.students.find_one(query)
    if not student:
        return 0.0
    
    class_id = student.get("class_id")
    if not class_id:
        return 0.0
    
    # Get class fee assignment
    assignment = db.class_fee_assignments.find_one({
        "school_id": school_id,
        "class_id": class_id
    })
    
    if not assignment:
        return 0.0
    
    category_id = assignment.get("category_id")
    if not category_id:
        return 0.0
    
    # Get fee category total
    category = db.fee_categories.find_one({
        "_id": ObjectId(category_id) if ObjectId.is_valid(category_id) else None,
        "school_id": school_id
    })
    
    if not category:
        return 0.0
    
    # Calculate total from components
    components = category.get("components", [])
    total = sum(comp.get("amount", 0) for comp in components)
    
    return total

def generate_monthly_fee(
    student_id: str,
    school_id: str,
    month: int,
    year: int,
    generated_by: Optional[str] = None
) -> Dict[str, Any]:
    """Generate monthly fee record for a student"""
    db = get_db()
    
    # Check if fee already exists
    existing = db.student_monthly_fees.find_one({
        "school_id": school_id,
        "student_id": student_id,
        "month": month,
        "year": year
    })
    
    if existing:
        return convert_objectid(existing)
    
    # Get student info
    student_query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        student_query["_id"] = ObjectId(student_id)
    else:
        student_query["student_id"] = student_id
    
    student = db.students.find_one(student_query)
    if not student:
        raise ValueError(f"Student not found: {student_id}")
    
    # Use ObjectId string for consistency
    student_id_str = str(student["_id"])
    
    # Get base fee
    base_fee = get_student_base_fee(student_id_str, school_id)
    
    # Get scholarship
    scholarship_percent = student.get("scholarship_percent", 0.0)
    scholarship_amount = round(base_fee * (scholarship_percent / 100), 2)
    
    # Calculate fee after discount
    fee_after_discount = round(base_fee - scholarship_amount, 2)
    
    # Compute arrears to add automatically:
    # - include legacy student arrears_balance
    # - include any previous monthly fees' remaining amounts that have not been carried yet
    now = datetime.utcnow()

    try:
        prev_query = {
            "school_id": school_id,
            "student_id": student_id_str,
            "$or": [
                {"year": {"$lt": year}},
                {"year": year, "month": {"$lt": month}}
            ],
            "remaining_amount": {"$gt": 0},
            "arrears_carried": {"$ne": True}
        }

        fees_to_carry = list(db.student_monthly_fees.find(prev_query))
        carried_total = sum(f.get("remaining_amount", 0.0) for f in fees_to_carry)
    except Exception:
        fees_to_carry = []
        carried_total = 0.0

    initial_arrears = student.get("arrears_balance", student.get("arrears", 0.0)) or 0.0
    arrears_added = round(initial_arrears + carried_total, 2)

    # Mark previous months as carried so we don't double-add in future generations
    if fees_to_carry:
        ids = [f["_id"] for f in fees_to_carry]
        db.student_monthly_fees.update_many(
            {"_id": {"$in": ids}},
            {"$set": {"arrears_carried": True, "status": FeeStatus.OVERDUE.value, "updated_at": now}}
        )

    # Clear legacy student arrears balance since we've included it in this month's fee
    if arrears_added > 0:
        update_student_arrears(student_id_str, school_id, 0.0)

    # Calculate final fee
    final_fee = round(fee_after_discount + arrears_added, 2)
    
    fee_record = {
        "school_id": school_id,
        "student_id": student_id_str,
        "month": month,
        "year": year,
        "base_fee": base_fee,
        "scholarship_percent": scholarship_percent,
        "scholarship_amount": scholarship_amount,
        "fee_after_discount": fee_after_discount,
        "arrears_added": arrears_added,
        "final_fee": final_fee,
        "amount_paid": 0.0,
        "remaining_amount": final_fee,
        "status": FeeStatus.UNPAID.value,
        "created_at": now,
        "updated_at": now,
        "generated_by": generated_by
    }
    
    result = db.student_monthly_fees.insert_one(fee_record)
    fee_record["id"] = str(result.inserted_id)
    if "_id" in fee_record:
        del fee_record["_id"]
    
    # Clear arrears from student after adding to fee
    if arrears_added > 0:
        update_student_arrears(student_id_str, school_id, 0.0)
    
    logger.info(f"Generated monthly fee for student {student_id_str}: {month}/{year} - {final_fee}")
    
    return fee_record

def generate_monthly_fees_for_class(
    class_id: str,
    school_id: str,
    month: int,
    year: int,
    generated_by: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Generate monthly fees for all students in a class"""
    db = get_db()
    
    students = list(db.students.find({
        "school_id": school_id,
        "class_id": class_id,
        "status": "active"
    }))
    
    results = []
    for student in students:
        try:
            fee = generate_monthly_fee(
                str(student["_id"]),
                school_id,
                month,
                year,
                generated_by
            )
            results.append(fee)
        except Exception as e:
            logger.error(f"Failed to generate fee for student {student['_id']}: {e}")
    
    return results

def get_student_monthly_fees(
    student_id: str,
    school_id: str,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 12
) -> Dict[str, Any]:
    """Get paginated monthly fees for a student"""
    db = get_db()
    
    query = {
        "school_id": school_id,
        "student_id": student_id
    }
    
    if year:
        query["year"] = year
    if status:
        query["status"] = status
    
    total = db.student_monthly_fees.count_documents(query)
    
    fees = list(
        db.student_monthly_fees.find(query)
        .sort([("year", -1), ("month", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    
    # Convert and add month names
    result_fees = []
    for fee in fees:
        fee = convert_objectid(fee)
        fee["month_name"] = get_month_name(fee["month"])
        result_fees.append(fee)
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "fees": result_fees
    }

def get_monthly_fee_by_id(fee_id: str, school_id: str) -> Optional[Dict[str, Any]]:
    """Get a single monthly fee record"""
    db = get_db()
    
    fee = db.student_monthly_fees.find_one({
        "_id": ObjectId(fee_id) if ObjectId.is_valid(fee_id) else None,
        "school_id": school_id
    })
    
    if fee:
        fee = convert_objectid(fee)
        fee["month_name"] = get_month_name(fee["month"])
    
    return fee

def get_fee_summary(student_id: str, school_id: str) -> Dict[str, Any]:
    """Get fee summary statistics for a student"""
    db = get_db()
    
    pipeline = [
        {
            "$match": {
                "school_id": school_id,
                "student_id": student_id
            }
        },
        {
            "$group": {
                "_id": None,
                "total_months": {"$sum": 1},
                "paid_months": {
                    "$sum": {"$cond": [{"$eq": ["$status", "PAID"]}, 1, 0]}
                },
                "partial_months": {
                    "$sum": {"$cond": [{"$eq": ["$status", "PARTIAL"]}, 1, 0]}
                },
                "unpaid_months": {
                    "$sum": {"$cond": [{"$eq": ["$status", "UNPAID"]}, 1, 0]}
                },
                "overdue_months": {
                    "$sum": {"$cond": [{"$eq": ["$status", "OVERDUE"]}, 1, 0]}
                },
                "total_fees_generated": {"$sum": "$final_fee"},
                "total_paid": {"$sum": "$amount_paid"},
                "total_remaining": {"$sum": "$remaining_amount"},
                "total_scholarship_given": {"$sum": "$scholarship_amount"}
            }
        }
    ]
    
    result = list(db.student_monthly_fees.aggregate(pipeline))
    
    if result:
        summary = result[0]
        del summary["_id"]
        return summary
    
    return {
        "total_months": 0,
        "paid_months": 0,
        "partial_months": 0,
        "unpaid_months": 0,
        "overdue_months": 0,
        "total_fees_generated": 0,
        "total_paid": 0,
        "total_remaining": 0,
        "total_scholarship_given": 0
    }

def get_current_month_fee(student_id: str, school_id: str) -> Optional[Dict[str, Any]]:
    """Get current month's fee record. Auto-generates if it doesn't exist."""
    now = datetime.utcnow()
    db = get_db()
    
    # Try to find existing fee for current month
    fee = db.student_monthly_fees.find_one({
        "school_id": school_id,
        "student_id": student_id,
        "month": now.month,
        "year": now.year
    })
    
    # If fee doesn't exist, generate it automatically
    if not fee:
        try:
            logger.info(f"[FEE] Auto-generating monthly fee for student {student_id}, month {now.month}/{now.year}")
            
            # First verify student exists and is in the right school
            student_query = {"school_id": school_id}
            if ObjectId.is_valid(student_id):
                student_query["_id"] = ObjectId(student_id)
            else:
                student_query["student_id"] = student_id
            
            student = db.students.find_one(student_query)
            if not student:
                logger.warning(f"[FEE] Student {student_id} not found in school {school_id}")
                return None
            
            # Use the ObjectId string for consistency
            student_id_str = str(student["_id"])
            
            # Generate the fee
            fee_dict = generate_monthly_fee(
                student_id=student_id_str,
                school_id=school_id,
                month=now.month,
                year=now.year,
                generated_by="auto-generate"
            )
            
            logger.info(f"[FEE] ✓ Successfully auto-generated fee for student {student_id_str}, final_fee: {fee_dict.get('final_fee', 0)}")
            fee = fee_dict
            
        except Exception as e:
            logger.error(f"[FEE] ❌ Failed to auto-generate monthly fee for student {student_id}: {str(e)}")
            logger.error(f"[FEE] Traceback: {traceback.format_exc()}")
            return None
    
    if fee:
        # Convert ObjectId if present
        if "_id" in fee:
            fee["id"] = str(fee["_id"])
            del fee["_id"]
        elif "id" not in fee and "_id" not in fee:
            # Already converted, no action needed
            pass
        
        # Ensure month_name is set
        if "month_name" not in fee and "month" in fee:
            fee["month_name"] = get_month_name(fee["month"])
    
    return fee

# ==================== PAYMENT SERVICE (M4) ====================

def create_payment(
    school_id: str,
    student_id: str,
    monthly_fee_id: str,
    amount: float,
    payment_method: str = "CASH",
    transaction_reference: Optional[str] = None,
    notes: Optional[str] = None,
    received_by: Optional[Any] = None,
    received_by_name: Optional[str] = None,
    received_by_role: Optional[str] = None,
    session_id: Optional[str] = None,
    payment_method_id: Optional[str] = None
) -> Dict[str, Any]:
    """Create a payment record and update monthly fee with full audit trail"""
    db = get_db()
    
    logger.info(f"💳 Creating payment: student={student_id}, amount={amount}, method={payment_method}, method_id={payment_method_id}")
    
    # Get the monthly fee
    fee = db.student_monthly_fees.find_one({
        "_id": ObjectId(monthly_fee_id),
        "school_id": school_id
    })
    
    if not fee:
        logger.error(f"❌ Monthly fee {monthly_fee_id} not found")
        raise ValueError("Monthly fee record not found")
    
    if amount <= 0:
        logger.error(f"❌ Invalid payment amount: {amount}")
        raise ValueError("Payment amount must be greater than 0")
    
    if amount > fee["remaining_amount"]:
        logger.warning(f"⚠️ Payment amount {amount} exceeds remaining {fee['remaining_amount']}")
        raise ValueError(f"Payment amount ({amount}) exceeds remaining amount ({fee['remaining_amount']})")
    
    now = datetime.utcnow()
    
    # TASK 5: Resolve payment method from payment_methods collection
    payment_method_name = payment_method  # Default fallback
    if payment_method_id:
        try:
            method = db.payment_methods.find_one({"_id": ObjectId(payment_method_id), "school_id": school_id})
            if method:
                payment_method_name = method.get("method_name", payment_method)
                logger.info(f"💳 Payment method resolved: {payment_method_id} -> {payment_method_name}")
            else:
                logger.warning(f"⚠️ Payment method {payment_method_id} not found, using: {payment_method}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to resolve payment method: {e}")
    
    # TASK 6: Create student snapshot for historical accuracy
    student_snapshot = {}
    try:
        student = db.students.find_one({"_id": ObjectId(student_id), "school_id": school_id})
        if student:
            class_info = {}
            if student.get("class_id"):
                class_doc = db.classes.find_one({"_id": ObjectId(student["class_id"]), "school_id": school_id})
                if class_doc:
                    class_info = {
                        "class_id": str(student["class_id"]),
                        "class_name": class_doc.get("class_name", "Unknown"),
                        "section": student.get("section", "")
                    }
            
            student_snapshot = {
                "student_name": student.get("student_name", "Unknown"),
                "father_name": student.get("father_name", ""),
                "roll_number": student.get("roll_number", ""),
                "class_info": class_info
            }
            logger.info(f"📚 Student snapshot stored: {student_snapshot.get('student_name')}")
    except Exception as e:
        logger.warning(f"⚠️ Failed to create student snapshot: {e}")
    
    # TASK 7: Collector metadata
    collector_info = {
        "user_id": received_by,
        "name": received_by_name or "Unknown",
        "role": received_by_role or "Unknown"
    }
    
    # Create payment record with enhanced fields
    payment = {
        "school_id": school_id,
        "student_id": student_id,
        "monthly_fee_id": monthly_fee_id,
        "amount": amount,
        "payment_method": payment_method_name,  # TASK 5: Use resolved name
        "payment_method_id": payment_method_id,  # TASK 5: Store ID reference
        "transaction_reference": transaction_reference,
        "notes": notes,
        "received_by": received_by,  # TASK 1: Fixed
        "collector_info": collector_info,  # TASK 7: Collector metadata
        "student_snapshot": student_snapshot,  # TASK 6: Student snapshot
        "session_id": session_id,  # TASK 4: Link to cash session
        "payment_date": now,  # TASK 8: Timestamp
        "created_at": now  # TASK 8: Timestamp
    }
    
    result = db.student_payments.insert_one(payment)
    payment["id"] = str(result.inserted_id)
    logger.info(f"✅ Payment document inserted: {payment['id']}")
    
    # TASK 4: Auto-record cash session transaction
    if session_id and payment_method_name.upper() in ["CASH", "کیش"]:
        try:
            from app.services.cash_session_service import record_transaction
            transaction = record_transaction(
                session_id=session_id,
                amount=amount,
                transaction_type="INCOME",
                description=f"Fee payment by {student_snapshot.get('student_name', 'Student')}",
                reference_type="STUDENT_FEE_PAYMENT",
                reference_id=payment["id"],
                notes=notes,
                school_id=school_id
            )
            logger.info(f"🧾 Cash session transaction recorded: {transaction.get('id')}")
        except Exception as e:
            logger.error(f"❌ Failed to record cash session transaction: {e}")
            # Don't fail payment if transaction recording fails
    
    # MODULE 2: Record payment in accounting ledger
    if session_id:
        try:
            from app.services.accounting_service import record_student_payment_to_ledger
            ledger_entry = record_student_payment_to_ledger(
                school_id=school_id,
                session_id=session_id,
                user_id=received_by,
                payment_id=payment["id"],
                amount=amount,
                student_name=student_snapshot.get("student_name", "Student")
            )
            logger.info(f"📒 Ledger entry created: {ledger_entry.get('id')}")
        except Exception as e:
            logger.error(f"❌ Failed to create ledger entry: {e}")
            # Don't fail payment if ledger recording fails
    
    # TASK 9: Update monthly fee (no breaking changes to existing logic)
    new_amount_paid = fee["amount_paid"] + amount
    new_remaining = fee["remaining_amount"] - amount
    
    if new_remaining <= 0:
        new_status = FeeStatus.PAID.value
        new_remaining = 0
    else:
        new_status = FeeStatus.PARTIAL.value
    
    db.student_monthly_fees.update_one(
        {"_id": ObjectId(monthly_fee_id)},
        {
            "$set": {
                "amount_paid": new_amount_paid,
                "remaining_amount": new_remaining,
                "status": new_status,
                "updated_at": now
            }
        }
    )
    logger.info(f"📊 Monthly fee updated: paid={new_amount_paid}, remaining={new_remaining}, status={new_status}")
    
    # Recompute and update student's arrears balance from fee records
    try:
        new_arrears_balance = compute_student_arrears_balance(student_id, school_id)
        update_student_arrears(student_id, school_id, new_arrears_balance)
        logger.info(f"💰 Student arrears recomputed: {new_arrears_balance}")
    except Exception as e:
        logger.warning(f"⚠️ Arrears recompute failed, using fallback: {e}")
        # If recompute fails, fall back to conservative behavior of setting arrears to sum of new_remaining
        update_student_arrears(student_id, school_id, new_remaining if new_remaining > 0 else 0.0)
    
    # Add month info to payment response
    payment["month"] = fee["month"]
    payment["year"] = fee["year"]
    payment["month_name"] = get_month_name(fee["month"])
    # Ensure JSON-serializable response (convert any ObjectId instances)
    try:
        payment = _convert_bson_recursive(payment)
    except Exception:
        # Fall back: ensure inserted id exists as string
        if "id" not in payment and hasattr(result, "inserted_id"):
            payment["id"] = str(result.inserted_id)
    
    logger.info(f"✅ Payment completed successfully: {payment['id']} for {amount} PKR")
    return payment

def get_student_payments(
    student_id: str,
    school_id: str,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """Get paginated payment records for a student"""
    db = get_db()
    
    query = {
        "school_id": school_id,
        "student_id": student_id
    }
    
    total = db.student_payments.count_documents(query)
    
    payments = list(
        db.student_payments.find(query)
        .sort("payment_date", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    
    # Enrich with month info
    result_payments = []
    for payment in payments:
        payment = convert_objectid(payment)
        
        # Get month info from fee record
        if payment.get("monthly_fee_id"):
            fee = db.student_monthly_fees.find_one({
                "_id": ObjectId(payment["monthly_fee_id"])
            })
            if fee:
                payment["month"] = fee["month"]
                payment["year"] = fee["year"]
                payment["month_name"] = get_month_name(fee["month"])
        
        result_payments.append(payment)
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "payments": result_payments
    }

def get_payment_summary(student_id: str, school_id: str) -> Dict[str, Any]:
    """Get payment summary for a student"""
    db = get_db()
    
    pipeline = [
        {
            "$match": {
                "school_id": school_id,
                "student_id": student_id
            }
        },
        {
            "$group": {
                "_id": "$payment_method",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }
        }
    ]
    
    method_results = list(db.student_payments.aggregate(pipeline))
    
    payments_by_method = {}
    total_amount = 0
    total_count = 0
    
    for r in method_results:
        payments_by_method[r["_id"]] = r["total"]
        total_amount += r["total"]
        total_count += r["count"]
    
    # Get recent payments
    recent = list(
        db.student_payments.find({
            "school_id": school_id,
            "student_id": student_id
        })
        .sort("payment_date", -1)
        .limit(5)
    )
    
    recent_payments = []
    for p in recent:
        p = convert_objectid(p)
        if p.get("monthly_fee_id"):
            fee = db.student_monthly_fees.find_one({"_id": ObjectId(p["monthly_fee_id"])})
            if fee:
                p["month"] = fee["month"]
                p["year"] = fee["year"]
                p["month_name"] = get_month_name(fee["month"])
        recent_payments.append(p)
    
    return {
        "total_payments": total_count,
        "total_amount_paid": total_amount,
        "payments_by_method": payments_by_method,
        "recent_payments": recent_payments
    }

def get_payments_for_fee(monthly_fee_id: str, school_id: str) -> List[Dict[str, Any]]:
    """Get all payments for a specific monthly fee"""
    db = get_db()
    
    payments = list(
        db.student_payments.find({
            "school_id": school_id,
            "monthly_fee_id": monthly_fee_id
        }).sort("payment_date", -1)
    )
    
    return [convert_objectid(p) for p in payments]

# ==================== FEE OVERVIEW SERVICE ====================

def get_student_fee_overview(student_id: str, school_id: str) -> Dict[str, Any]:
    """Get complete fee overview for a student.

    Optimized: minimize DB round-trips by inlining lookups and using aggregation
    for summaries. If the current month's fee is missing we compute it in-memory
    (no write) to avoid blocking the overview with inserts.
    """
    db = get_db()

    # Fetch student once
    student_query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        student_query["_id"] = ObjectId(student_id)
    else:
        student_query["student_id"] = student_id

    student = db.students.find_one(student_query)
    if not student:
        return None

    student_id_str = str(student["_id"])

    # Basic student-level fields
    scholarship_percent = student.get("scholarship_percent", 0.0)
    arrears_balance = student.get("arrears_balance", student.get("arrears", 0.0)) or 0.0

    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year

    # Attempt to fetch an existing current-month fee (single query)
    current_fee = db.student_monthly_fees.find_one({
        "school_id": school_id,
        "student_id": student_id_str,
        "month": current_month,
        "year": current_year
    })

    auto_computed = False
    if not current_fee:
        # Compute base fee quickly from class assignment + fee category (no student re-query)
        base_fee = 0.0
        class_id = student.get("class_id")
        if class_id:
            assign_key = f"class_assign:{school_id}:{class_id}"
            assignment = _cache_get(assign_key)
            if assignment is None:
                assignment = db.class_fee_assignments.find_one({"school_id": school_id, "class_id": class_id})
                _cache_set(assign_key, assignment)

            if assignment:
                category_id = assignment.get("category_id")
                if category_id:
                    try:
                        cat_key = f"fee_cat:{school_id}:{category_id}"
                        cat = _cache_get(cat_key)
                        if cat is None:
                            cat = db.fee_categories.find_one({"_id": ObjectId(category_id) if ObjectId.is_valid(category_id) else None, "school_id": school_id})
                            _cache_set(cat_key, cat)

                        if cat:
                            comps = cat.get("components", [])
                            base_fee = sum(c.get("amount", 0) for c in comps)
                    except Exception:
                        base_fee = 0.0

        # compute scholarship and arrears without writing to DB
        scholarship_amount = round(base_fee * (scholarship_percent / 100.0), 2)
        fee_after_discount = round(base_fee - scholarship_amount, 2)

        # collect previous outstanding fees to add as arrears
        prev_query = {
            "school_id": school_id,
            "student_id": student_id_str,
            "$or": [
                {"year": {"$lt": current_year}},
                {"year": current_year, "month": {"$lt": current_month}}
            ],
            "remaining_amount": {"$gt": 0},
            "arrears_carried": {"$ne": True}
        }
        prev_fees = list(db.student_monthly_fees.find(prev_query))
        carried_total = sum(f.get("remaining_amount", 0.0) for f in prev_fees)

        initial_arrears = student.get("arrears_balance", student.get("arrears", 0.0)) or 0.0
        arrears_added = round(initial_arrears + carried_total, 2)

        final_fee = round(fee_after_discount + arrears_added, 2)

        current_fee = {
            "student_id": student_id_str,
            "month": current_month,
            "year": current_year,
            "base_fee": base_fee,
            "scholarship_percent": scholarship_percent,
            "scholarship_amount": scholarship_amount,
            "fee_after_discount": fee_after_discount,
            "arrears_added": arrears_added,
            "final_fee": final_fee,
            "amount_paid": 0.0,
            "remaining_amount": final_fee,
            "status": FeeStatus.UNPAID.value,
            "generated_by": "computed-on-the-fly",
            "created_at": now,
            "updated_at": now,
            "month_name": get_month_name(current_month)
        }
        auto_computed = True
    else:
        # Convert ObjectId to id & ensure month_name
        if "_id" in current_fee:
            current_fee = convert_objectid(current_fee)
        if "month_name" not in current_fee and "month" in current_fee:
            current_fee["month_name"] = get_month_name(current_fee["month"])

    # Use aggregation to compute fee summary (single aggregation)
    fee_pipeline = [
        {"$match": {"school_id": school_id, "student_id": student_id_str}},
        {"$group": {
            "_id": None,
            "total_months": {"$sum": 1},
            "paid_months": {"$sum": {"$cond": [{"$eq": ["$status", FeeStatus.PAID.value]}, 1, 0]}},
            "partial_months": {"$sum": {"$cond": [{"$eq": ["$status", FeeStatus.PARTIAL.value]}, 1, 0]}},
            "unpaid_months": {"$sum": {"$cond": [{"$eq": ["$status", FeeStatus.UNPAID.value]}, 1, 0]}},
            "overdue_months": {"$sum": {"$cond": [{"$eq": ["$status", FeeStatus.OVERDUE.value]}, 1, 0]}},
            "total_fees_generated": {"$sum": "$final_fee"},
            "total_paid": {"$sum": "$amount_paid"},
            "total_remaining": {"$sum": "$remaining_amount"},
            "total_scholarship_given": {"$sum": "$scholarship_amount"}
        }}
    ]
    fee_summary_res = list(db.student_monthly_fees.aggregate(fee_pipeline))
    if fee_summary_res:
        fee_summary = fee_summary_res[0]
        del fee_summary["_id"]
    else:
        fee_summary = {
            "total_months": 0,
            "paid_months": 0,
            "partial_months": 0,
            "unpaid_months": 0,
            "overdue_months": 0,
            "total_fees_generated": 0,
            "total_paid": 0,
            "total_remaining": 0,
            "total_scholarship_given": 0
        }

    # Payment summary: totals by method + recent payments
    payment_pipeline = [
        {"$match": {"school_id": school_id, "student_id": student_id_str}},
        {"$group": {"_id": "$payment_method", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    method_results = list(db.student_payments.aggregate(payment_pipeline))

    payments_by_method = {}
    total_amount = 0
    total_count = 0
    for r in method_results:
        payments_by_method[r["_id"]] = r["total"]
        total_amount += r["total"]
        total_count += r["count"]

    recent = list(db.student_payments.find({"school_id": school_id, "student_id": student_id_str}).sort("payment_date", -1).limit(5))
    recent_payments = []
    for p in recent:
        p = convert_objectid(p)
        if p.get("monthly_fee_id"):
            try:
                fee = db.student_monthly_fees.find_one({"_id": ObjectId(p["monthly_fee_id"])})
                if fee:
                    p["month"] = fee["month"]
                    p["year"] = fee["year"]
                    p["month_name"] = get_month_name(fee["month"])
            except Exception:
                pass
        recent_payments.append(p)

    payment_summary = {
        "total_payments": total_count,
        "total_amount_paid": total_amount,
        "payments_by_method": payments_by_method,
        "recent_payments": recent_payments
    }

    # base fee: reuse computed base_fee if we computed it above, otherwise compute quickly
    try:
        if 'base_fee' in locals():
            base_fee_val = base_fee
        else:
            base_fee_val = 0.0
            class_id = student.get("class_id")
            if class_id:
                assign_key = f"class_assign:{school_id}:{class_id}"
                assignment = _cache_get(assign_key)
                if assignment is None:
                    assignment = db.class_fee_assignments.find_one({"school_id": school_id, "class_id": class_id})
                    _cache_set(assign_key, assignment)

                if assignment:
                    category_id = assignment.get("category_id")
                    if category_id:
                        cat_key = f"fee_cat:{school_id}:{category_id}"
                        cat = _cache_get(cat_key)
                        if cat is None:
                            cat = db.fee_categories.find_one({"_id": ObjectId(category_id) if ObjectId.is_valid(category_id) else None, "school_id": school_id})
                            _cache_set(cat_key, cat)
                        if cat:
                            base_fee_val = sum(c.get("amount", 0) for c in cat.get("components", []))
    except Exception:
        base_fee_val = 0.0

    # ensure current_fee has month_name
    if isinstance(current_fee, dict) and "month" in current_fee and "month_name" not in current_fee:
        current_fee["month_name"] = get_month_name(current_fee["month"])

    # Return overview payload
    # minimal student info to avoid extra student fetch on frontend
    student_public = {
        "id": student_id_str,
        "name": student.get("name") or student.get("full_name") or student.get("first_name") or "",
        "student_code": student.get("student_code") or student.get("admission_number") or "",
        "class_id": student.get("class_id")
    }

    overview = {
        "student_id": student_id_str,
        "student": student_public,
        "scholarship_percent": scholarship_percent,
        "arrears_balance": arrears_balance,
        "base_fee": base_fee_val,
        "current_month_fee": current_fee,
        "fee_summary": fee_summary,
        "payment_summary": payment_summary,
        "current_fee_auto_computed": auto_computed
    }

    return overview


def get_students_current_month_status(student_ids: List[str], school_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Get current month fee status for multiple students efficiently.
    Returns a mapping of student_id -> current month fee data.
    
    OPTIMIZED: Bulk-fetches all data and batch-generates missing fees.
    """
    db = get_db()
    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year
    
    logger.info(f"[FEE_STATUS] Fetching current month status for {len(student_ids)} students (month: {current_month}/{current_year})")
    
    # Step 1: Query current month fees for all students in ONE query
    fees_query = {
        "school_id": school_id,
        "student_id": {"$in": student_ids},
        "month": current_month,
        "year": current_year
    }
    
    current_fees = list(db.student_monthly_fees.find(fees_query))
    fees_map = {fee["student_id"]: fee for fee in current_fees}
    logger.info(f"[FEE_STATUS] Found {len(current_fees)} existing fee records")
    
    # Step 2: Find students missing fees
    students_needing_generation = [sid for sid in student_ids if sid not in fees_map]
    
    if not students_needing_generation:
        # All students have fees - fast path
        results = {}
        for student_id, fee in fees_map.items():
            results[student_id] = {
                "status": fee.get("status", "UNPAID"),
                "base_fee": fee.get("base_fee", 0.0),
                "scholarship_percent": fee.get("scholarship_percent", 0.0),
                "scholarship_amount": fee.get("scholarship_amount", 0.0),
                "fee_after_discount": fee.get("fee_after_discount", 0.0),
                "arrears_added": fee.get("arrears_added", 0.0),
                "final_fee": fee.get("final_fee", 0.0),
                "amount_paid": fee.get("amount_paid", 0.0),
                "remaining_amount": fee.get("remaining_amount", 0.0),
                "month": fee.get("month"),
                "year": fee.get("year"),
                "month_name": get_month_name(fee.get("month", current_month))
            }
        logger.info(f"[FEE_STATUS] ✓ All fees exist, returning {len(results)} students")
        return results
    
    # Step 3: Bulk-fetch student data for those needing generation
    logger.info(f"[FEE_STATUS] Need to generate fees for {len(students_needing_generation)} students")
    
    student_obj_ids = []
    for sid in students_needing_generation:
        try:
            student_obj_ids.append(ObjectId(sid))
        except:
            pass
    
    students = list(db.students.find({
        "_id": {"$in": student_obj_ids},
        "school_id": school_id
    }))
    students_map = {str(s["_id"]): s for s in students}
    
    # Step 4: Bulk-fetch class assignments and categories
    class_ids = list({s.get("class_id") for s in students if s.get("class_id")})
    
    assignments = {}
    categories = {}
    
    if class_ids:
        class_assignments = list(db.class_fee_assignments.find({
            "class_id": {"$in": class_ids},
            "school_id": school_id
        }))
        
        for ca in class_assignments:
            assignments[ca["class_id"]] = ca.get("category_id")
        
        category_ids = [ObjectId(cid) for cid in assignments.values() if ObjectId.is_valid(cid)]
        
        if category_ids:
            cats = list(db.fee_categories.find({
                "_id": {"$in": category_ids},
                "school_id": school_id
            }))
            
            for cat in cats:
                components = cat.get("components", [])
                total = sum(comp.get("amount", 0) for comp in components)
                categories[str(cat["_id"])] = total
    
    # Step 5: Bulk-fetch previous month fees for arrears calculation
    prev_fees_query = {
        "school_id": school_id,
        "student_id": {"$in": students_needing_generation},
        "$or": [
            {"year": {"$lt": current_year}},
            {"year": current_year, "month": {"$lt": current_month}}
        ],
        "remaining_amount": {"$gt": 0},
        "arrears_carried": {"$ne": True}
    }
    
    prev_fees = list(db.student_monthly_fees.find(prev_fees_query))
    
    # Group previous fees by student_id
    prev_fees_by_student = {}
    for pf in prev_fees:
        sid = pf["student_id"]
        if sid not in prev_fees_by_student:
            prev_fees_by_student[sid] = []
        prev_fees_by_student[sid].append(pf)
    
    # Step 6: Batch-generate fees
    fees_to_insert = []
    fees_to_mark_carried = []
    students_to_clear_arrears = []
    
    for student_id in students_needing_generation:
        student = students_map.get(student_id)
        if not student:
            continue
        
        # Calculate base fee from cached data
        class_id = student.get("class_id")
        base_fee = 0.0
        
        if class_id and class_id in assignments:
            category_id = assignments[class_id]
            base_fee = categories.get(str(category_id), 0.0)
        
        # Get scholarship
        scholarship_percent = student.get("scholarship_percent", 0.0)
        scholarship_amount = round(base_fee * (scholarship_percent / 100), 2)
        fee_after_discount = round(base_fee - scholarship_amount, 2)
        
        # Calculate arrears
        initial_arrears = student.get("arrears_balance", student.get("arrears", 0.0)) or 0.0
        carried_total = sum(pf.get("remaining_amount", 0) for pf in prev_fees_by_student.get(student_id, []))
        arrears_added = round(initial_arrears + carried_total, 2)
        
        # Schedule marking previous fees as carried
        for pf in prev_fees_by_student.get(student_id, []):
            fees_to_mark_carried.append(pf["_id"])
        
        # Schedule clearing student arrears
        if arrears_added > 0:
            students_to_clear_arrears.append(student_id)
        
        # Calculate final fee
        final_fee = round(fee_after_discount + arrears_added, 2)
        
        fee_record = {
            "school_id": school_id,
            "student_id": student_id,
            "month": current_month,
            "year": current_year,
            "base_fee": base_fee,
            "scholarship_percent": scholarship_percent,
            "scholarship_amount": scholarship_amount,
            "fee_after_discount": fee_after_discount,
            "arrears_added": arrears_added,
            "final_fee": final_fee,
            "amount_paid": 0.0,
            "remaining_amount": final_fee,
            "status": FeeStatus.UNPAID.value,
            "created_at": now,
            "updated_at": now,
            "generated_by": "auto-bulk-generate"
        }
        
        fees_to_insert.append(fee_record)
    
    # Step 7: Batch insert and update
    if fees_to_insert:
        logger.info(f"[FEE_STATUS] Batch-inserting {len(fees_to_insert)} fee records")
        db.student_monthly_fees.insert_many(fees_to_insert)
    
    if fees_to_mark_carried:
        logger.info(f"[FEE_STATUS] Marking {len(fees_to_mark_carried)} previous fees as carried")
        db.student_monthly_fees.update_many(
            {"_id": {"$in": fees_to_mark_carried}},
            {"$set": {"arrears_carried": True, "status": FeeStatus.OVERDUE.value, "updated_at": now}}
        )
    
    if students_to_clear_arrears:
        logger.info(f"[FEE_STATUS] Clearing arrears for {len(students_to_clear_arrears)} students")
        student_clear_ids = [ObjectId(sid) for sid in students_to_clear_arrears if ObjectId.is_valid(sid)]
        db.students.update_many(
            {"_id": {"$in": student_clear_ids}},
            {"$set": {"arrears_balance": 0.0, "arrears": 0.0, "updated_at": now}}
        )
    
    # Step 8: Build results from both existing and newly generated fees
    results = {}
    
    # Add existing fees
    for student_id, fee in fees_map.items():
        results[student_id] = {
            "status": fee.get("status", "UNPAID"),
            "base_fee": fee.get("base_fee", 0.0),
            "scholarship_percent": fee.get("scholarship_percent", 0.0),
            "scholarship_amount": fee.get("scholarship_amount", 0.0),
            "fee_after_discount": fee.get("fee_after_discount", 0.0),
            "arrears_added": fee.get("arrears_added", 0.0),
            "final_fee": fee.get("final_fee", 0.0),
            "amount_paid": fee.get("amount_paid", 0.0),
            "remaining_amount": fee.get("remaining_amount", 0.0),
            "month": fee.get("month"),
            "year": fee.get("year"),
            "month_name": get_month_name(fee.get("month", current_month))
        }
    
    # Add newly generated fees
    for fee in fees_to_insert:
        results[fee["student_id"]] = {
            "status": fee.get("status", "UNPAID"),
            "base_fee": fee.get("base_fee", 0.0),
            "scholarship_percent": fee.get("scholarship_percent", 0.0),
            "scholarship_amount": fee.get("scholarship_amount", 0.0),
            "fee_after_discount": fee.get("fee_after_discount", 0.0),
            "arrears_added": fee.get("arrears_added", 0.0),
            "final_fee": fee.get("final_fee", 0.0),
            "amount_paid": fee.get("amount_paid", 0.0),
            "remaining_amount": fee.get("remaining_amount", 0.0),
            "month": current_month,
            "year": current_year,
            "month_name": get_month_name(current_month)
        }
    
    logger.info(f"[FEE_STATUS] ✓ Returning status for {len(results)} students")
    return results

# ==================== ARREARS CARRYFORWARD SERVICE ====================

def carry_forward_arrears(school_id: str) -> Dict[str, Any]:
    """Carry forward unpaid amounts as arrears to next month (run at month end)"""
    db = get_db()
    
    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year
    
    # Find all UNPAID or PARTIAL fees from previous months
    query = {
        "school_id": school_id,
        "status": {"$in": [FeeStatus.UNPAID.value, FeeStatus.PARTIAL.value]},
        "arrears_carried": {"$ne": True},
        "$or": [
            {"year": {"$lt": current_year}},
            {"year": current_year, "month": {"$lt": current_month}}
        ]
    }
    
    fees_to_update = list(db.student_monthly_fees.find(query))
    
    updated_count = 0
    total_arrears = 0
    
    students_to_recalc = set()
    
    for fee in fees_to_update:
        remaining = fee["remaining_amount"]
        if remaining > 0:
            # Update fee status to OVERDUE and mark carried
            db.student_monthly_fees.update_one(
                {"_id": fee["_id"]},
                    {"$set": {"status": FeeStatus.OVERDUE.value, "arrears_carried": True, "updated_at": now}}
            )
            students_to_recalc.add(fee["student_id"])
            total_arrears += remaining
            updated_count += 1

    # After updating fee records, recompute arrears per affected student to keep balances accurate
    total_arrears = 0
    for sid in students_to_recalc:
        try:
            new_balance = compute_student_arrears_balance(sid, school_id)
            update_student_arrears(sid, school_id, new_balance)
            total_arrears += new_balance
        except Exception:
            # best-effort: continue
            continue
    
    logger.info(f"Carried forward arrears for {updated_count} fee records. Total arrears: {total_arrears}")
    
    return {
        "updated_count": updated_count,
        "total_arrears": total_arrears
    }

# ==================== CHART DATA SERVICE (M6) ====================

def get_payment_chart_data(student_id: str, school_id: str, year: Optional[int] = None) -> Dict[str, Any]:
    """Get chart data for payment visualizations"""
    db = get_db()
    
    if not year:
        year = datetime.utcnow().year
    
    # Get monthly fees for the year
    fees = list(db.student_monthly_fees.find({
        "school_id": school_id,
        "student_id": student_id,
        "year": year
    }).sort("month", 1))
    
    # Payment status pie chart data
    status_counts = {
        "PAID": 0,
        "PARTIAL": 0,
        "UNPAID": 0,
        "OVERDUE": 0
    }
    
    # Monthly payment bar chart data
    monthly_data = []
    
    for fee in fees:
        status = fee.get("status", "UNPAID")
        status_counts[status] = status_counts.get(status, 0) + 1
        
        monthly_data.append({
            "month": fee["month"],
            "month_name": get_month_name(fee["month"]),
            "fee": fee["final_fee"],
            "paid": fee["amount_paid"],
            "remaining": fee["remaining_amount"]
        })
    
    return {
        "year": year,
        "status_pie_chart": {
            "labels": list(status_counts.keys()),
            "data": list(status_counts.values())
        },
        "monthly_bar_chart": {
            "labels": [d["month_name"] for d in monthly_data],
            "fees": [d["fee"] for d in monthly_data],
            "paid": [d["paid"] for d in monthly_data],
            "remaining": [d["remaining"] for d in monthly_data]
        },
        "monthly_details": monthly_data
    }
