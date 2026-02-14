from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.fee import FeePaymentCreate, FeePaymentInDB, FeePaymentUpdate, FeePaymentResponse
from app.services.fee_payment_service import (
    record_fee_payment, get_fee_payment_by_id, get_fee_payments_for_student,
    get_fee_payments_for_class, get_all_fee_payments, update_fee_payment,
    delete_fee_payment, get_fee_payment_summary_for_student
)
from app.dependencies.auth import check_permission
from bson import ObjectId

def convert_objectids(obj):
    """Recursively convert ObjectId to string in dict/list"""
    if isinstance(obj, dict):
        return {k: convert_objectids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

router = APIRouter(prefix="/api/fee-payments", tags=["Fee Payments"])

@router.post("", response_model=dict)
async def create_fee_payment(
    payment_data: FeePaymentCreate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Record a new fee payment"""
    # Validate payment amount doesn't exceed remaining due
    from app.services.fee_payment_service import get_fee_payment_summary_for_student
    
    summary = get_fee_payment_summary_for_student(payment_data.student_id)
    if payment_data.amount_paid > summary["remaining_amount"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Payment amount (${payment_data.amount_paid}) cannot exceed remaining due (${summary['remaining_amount']})"
        )
    
    data = payment_data.dict()
    data["received_by"] = current_user["id"]
    
    payment = record_fee_payment(data)
    if not payment:
        raise HTTPException(status_code=400, detail="Failed to record payment")
    
    return convert_objectids(payment)

@router.get("", response_model=List[dict])
async def list_fee_payments(
    student_id: Optional[str] = None,
    class_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments with optional filters"""
    filters = {}
    if student_id:
        filters["student_id"] = student_id
    if class_id:
        filters["class_id"] = class_id
    if payment_method:
        filters["payment_method"] = payment_method
    
    payments = get_all_fee_payments(filters)
    return [convert_objectids(payment) for payment in payments]

@router.get("/{payment_id}", response_model=dict)
async def get_fee_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee payment by ID"""
    payment = get_fee_payment_by_id(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return convert_objectids(payment)

@router.get("/student/{student_id}", response_model=List[dict])
async def get_student_fee_payments(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments for a student"""
    payments = get_fee_payments_for_student(student_id)
    return [convert_objectids(payment) for payment in payments]

@router.get("/class/{class_id}", response_model=List[dict])
async def get_class_fee_payments(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments for a class"""
    payments = get_fee_payments_for_class(class_id)
    return [convert_objectids(payment) for payment in payments]

@router.get("/student/{student_id}/summary", response_model=dict)
async def get_student_fee_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee payment summary for a student"""
    summary = get_fee_payment_summary_for_student(student_id)
    return summary

@router.put("/{payment_id}", response_model=dict)
async def update_fee_payment_record(
    payment_id: str,
    update_data: FeePaymentUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update a fee payment"""
    updated = update_fee_payment(payment_id, update_data.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Payment not found or update failed")
    
    return convert_objectids(updated)

@router.delete("/{payment_id}")
async def delete_fee_payment_record(
    payment_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Delete a fee payment"""
    success = delete_fee_payment(payment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return {"deleted": True}