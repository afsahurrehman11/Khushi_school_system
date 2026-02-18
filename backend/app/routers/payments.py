from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import logging
from app.models.fee import PaymentCreate, PaymentInDB, PaymentUpdate
from app.services.payment_service import (
    record_payment, get_payment_by_id, get_payments_for_challan,
    get_payments_for_student, get_all_payments, update_payment,
    delete_payment, get_payment_summary_for_student
)
from app.dependencies.auth import check_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Payments"])

@router.get("/payments", response_model=List[dict])
async def list_payments(
    challan_id: Optional[str] = None,
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments with optional filters"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching payments")
    
    try:
        filters = {}
        if challan_id:
            filters["challan_id"] = challan_id
        if student_id:
            filters["student_id"] = student_id
        
        payments = get_all_payments(filters, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(payments)} payments")
        return payments
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payments")

@router.get("/payments/{payment_id}", response_model=dict)
async def get_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get payment by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching payment {payment_id}")
    
    try:
        payment = get_payment_by_id(payment_id, school_id=school_id)
        if not payment:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found")
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Payment {payment_id} found")
        return payment
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment")

@router.get("/challan/{challan_id}/payments", response_model=List[dict])
async def get_challan_payments(
    challan_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments for a challan"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching payments for challan {challan_id}")
    
    try:
        payments = get_payments_for_challan(challan_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(payments)} challan payments")
        return payments
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch challan payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch challan payments")

@router.get("/students/{student_id}/payments", response_model=List[dict])
async def get_student_payments(
    student_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get all payments for a student"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching payments for student {student_id}")
    
    try:
        payments = get_payments_for_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(payments)} student payments")
        return payments
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch student payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch student payments")

@router.get("/students/{student_id}/payment-summary", response_model=dict)
async def get_student_payment_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("payments.view"))
):
    """Get payment summary for a student"""
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id or 'All'}] Fetching payment summary for student {student_id}")
    
    try:
        summary = get_payment_summary_for_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Payment summary retrieved")
        return summary
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch payment summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment summary")

@router.post("/payments", response_model=dict)
async def record_new_payment(
    payment: PaymentCreate,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Record a new payment"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Recording payment")
    
    try:
        data = payment.dict()
        data["received_by"] = current_user.get("id")
        
        result = record_payment(data, school_id=school_id)
        if not result:
            logger.warning(f"[SCHOOL:{school_id}] Payment recording failed")
            raise HTTPException(status_code=400, detail="Failed to record payment")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Payment {result.get('_id')} recorded")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to record payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record payment")

@router.put("/payments/{payment_id}", response_model=dict)
async def update_existing_payment(
    payment_id: str,
    update_data: PaymentUpdate,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Update payment details"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating payment {payment_id}")
    
    try:
        result = update_payment(payment_id, update_data.dict(exclude_unset=True), school_id=school_id)
        if not result:
            logger.warning(f"[SCHOOL:{school_id}] Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Payment {payment_id} updated")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update payment")

@router.delete("/payments/{payment_id}")
async def delete_existing_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("payments.manage"))
):
    """Delete a payment"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting payment {payment_id}")
    
    try:
        success = delete_payment(payment_id, school_id=school_id)
        if not success:
            logger.warning(f"[SCHOOL:{school_id}] Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Payment {payment_id} deleted")
        return {"message": "Payment deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete payment")
