from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.fee import PaymentCreate, PaymentInDB, PaymentUpdate
from app.services.payment_service import (
    record_payment, get_payment_by_id, get_payments_for_challan,
    get_payments_for_student, get_all_payments, update_payment,
    delete_payment, get_payment_summary_for_student
)
from app.dependencies.auth import check_permission

router = APIRouter(prefix="/api", tags=["Payments"])

@router.get("/payments", response_model=List[dict])
async def list_payments(
    challan_id: Optional[str] = None,
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments with optional filters"""
    filters = {}
    if challan_id:
        filters["challan_id"] = challan_id
    if student_id:
        filters["student_id"] = student_id
    
    payments = get_all_payments(filters)
    return payments

@router.get("/payments/{payment_id}", response_model=dict)
async def get_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get payment by ID"""
    payment = get_payment_by_id(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return payment

@router.get("/challan/{challan_id}/payments", response_model=List[dict])
async def get_challan_payments(
    challan_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments for a challan"""
    payments = get_payments_for_challan(challan_id)
    return payments

@router.get("/students/{student_id}/payments", response_model=List[dict])
async def get_student_payments(
    student_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments for a student"""
    payments = get_payments_for_student(student_id)
    return payments

@router.get("/students/{student_id}/payment-summary", response_model=dict)
async def get_student_payment_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get payment summary for a student"""
    summary = get_payment_summary_for_student(student_id)
    return summary

@router.post("/payments", response_model=dict)
async def record_new_payment(
    payment: PaymentCreate,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Record a new payment"""
    data = payment.dict()
    data["received_by"] = current_user.get("id")
    
    result = record_payment(data)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to record payment")
    
    return result

@router.put("/payments/{payment_id}", response_model=dict)
async def update_existing_payment(
    payment_id: str,
    update_data: PaymentUpdate,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Update payment details"""
    result = update_payment(payment_id, update_data.dict(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return result

@router.delete("/payments/{payment_id}")
async def delete_existing_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Delete a payment"""
    success = delete_payment(payment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return {"message": "Payment deleted successfully"}
