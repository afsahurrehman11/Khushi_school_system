"""
Student Monthly Fee Service - M2, M3, M4 Implementation
Handles scholarship, monthly fee generation, and payment processing
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from bson import ObjectId
import logging
import calendar

from app.database import get_db
from app.models.student_monthly_fee import (
    FeeStatus, StudentMonthlyFeeCreate, StudentMonthlyFeeInDB,
    StudentMonthlyFeeResponse, MonthlyFeeSummary, MonthlyFeeBreakdown,
    PaymentMethod, StudentPaymentCreate, StudentPaymentInDB,
    StudentPaymentResponse, PaymentSummary
)

logger = logging.getLogger(__name__)

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
    
    # Get arrears
    arrears_added = student.get("arrears_balance", student.get("arrears", 0.0))
    
    # Calculate final fee
    final_fee = round(fee_after_discount + arrears_added, 2)
    
    now = datetime.utcnow()
    
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
    """Get current month's fee record"""
    now = datetime.utcnow()
    db = get_db()
    
    fee = db.student_monthly_fees.find_one({
        "school_id": school_id,
        "student_id": student_id,
        "month": now.month,
        "year": now.year
    })
    
    if fee:
        fee = convert_objectid(fee)
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
    received_by: Optional[str] = None
) -> Dict[str, Any]:
    """Create a payment record and update monthly fee"""
    db = get_db()
    
    # Get the monthly fee
    fee = db.student_monthly_fees.find_one({
        "_id": ObjectId(monthly_fee_id),
        "school_id": school_id
    })
    
    if not fee:
        raise ValueError("Monthly fee record not found")
    
    if amount <= 0:
        raise ValueError("Payment amount must be greater than 0")
    
    if amount > fee["remaining_amount"]:
        raise ValueError(f"Payment amount ({amount}) exceeds remaining amount ({fee['remaining_amount']})")
    
    now = datetime.utcnow()
    
    # Create payment record
    payment = {
        "school_id": school_id,
        "student_id": student_id,
        "monthly_fee_id": monthly_fee_id,
        "amount": amount,
        "payment_method": payment_method,
        "transaction_reference": transaction_reference,
        "notes": notes,
        "received_by": received_by,
        "payment_date": now,
        "created_at": now
    }
    
    result = db.student_payments.insert_one(payment)
    payment["id"] = str(result.inserted_id)
    
    # Update monthly fee
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
    
    # Update student arrears balance
    # If fully paid, arrears becomes 0; if partial, remaining becomes arrears for next month
    if new_status == FeeStatus.PAID.value:
        update_student_arrears(student_id, school_id, 0.0)
    else:
        update_student_arrears(student_id, school_id, new_remaining)
    
    logger.info(f"Payment recorded: {amount} for fee {monthly_fee_id}. Status: {new_status}")
    
    # Add month info to payment response
    payment["month"] = fee["month"]
    payment["year"] = fee["year"]
    payment["month_name"] = get_month_name(fee["month"])
    
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
    """Get complete fee overview for a student"""
    db = get_db()
    
    # Get student
    student_query = {"school_id": school_id}
    if ObjectId.is_valid(student_id):
        student_query["_id"] = ObjectId(student_id)
    else:
        student_query["student_id"] = student_id
    
    student = db.students.find_one(student_query)
    if not student:
        return None
    
    student_id_str = str(student["_id"])
    
    # Get scholarship info
    scholarship_percent = student.get("scholarship_percent", 0.0)
    arrears_balance = student.get("arrears_balance", student.get("arrears", 0.0))
    
    # Get current month fee
    current_fee = get_current_month_fee(student_id_str, school_id)
    
    # Get fee summary
    fee_summary = get_fee_summary(student_id_str, school_id)
    
    # Get payment summary
    payment_summary = get_payment_summary(student_id_str, school_id)
    
    # Get base fee for display
    base_fee = get_student_base_fee(student_id_str, school_id)
    
    return {
        "student_id": student_id_str,
        "scholarship_percent": scholarship_percent,
        "arrears_balance": arrears_balance,
        "base_fee": base_fee,
        "current_month_fee": current_fee,
        "fee_summary": fee_summary,
        "payment_summary": payment_summary
    }

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
        "$or": [
            {"year": {"$lt": current_year}},
            {"year": current_year, "month": {"$lt": current_month}}
        ]
    }
    
    fees_to_update = list(db.student_monthly_fees.find(query))
    
    updated_count = 0
    total_arrears = 0
    
    for fee in fees_to_update:
        remaining = fee["remaining_amount"]
        if remaining > 0:
            # Update fee status to OVERDUE
            db.student_monthly_fees.update_one(
                {"_id": fee["_id"]},
                {"$set": {"status": FeeStatus.OVERDUE.value, "updated_at": now}}
            )
            
            # Update student arrears balance
            student_id = fee["student_id"]
            student = db.students.find_one({"_id": ObjectId(student_id)})
            if student:
                current_arrears = student.get("arrears_balance", 0)
                new_arrears = current_arrears + remaining
                update_student_arrears(student_id, school_id, new_arrears)
                total_arrears += remaining
            
            updated_count += 1
    
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
