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
import logging

logger = logging.getLogger(__name__)

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
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Recording fee payment")
    
    try:
        from app.services.fee_payment_service import get_fee_payment_summary_for_student
        
        summary = get_fee_payment_summary_for_student(payment_data.student_id, school_id=school_id)
        if payment_data.amount_paid > summary["remaining_amount"]:
            logger.error(f"[SCHOOL:{school_id}] ❌ Payment exceeds remaining due")
            raise HTTPException(
                status_code=400, 
                detail=f"Payment amount (${payment_data.amount_paid}) cannot exceed remaining due (${summary['remaining_amount']})"
            )
        
        data = payment_data.dict()
        data["received_by"] = current_user["id"]
        data["school_id"] = school_id  # Include school_id for cash session tracking
        
        payment = record_fee_payment(data)
        if not payment:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to record payment")
            raise HTTPException(status_code=400, detail="Failed to record payment")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Fee payment recorded")
        return convert_objectids(payment)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error recording payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record payment")

@router.get("", response_model=List[dict])
async def list_fee_payments(
    student_id: Optional[str] = None,
    class_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments with optional filters"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Listing fee payments")
    
    try:
        filters = {"school_id": school_id} if school_id else {}
        if student_id:
            filters["student_id"] = student_id
        if class_id:
            filters["class_id"] = class_id
        if payment_method:
            filters["payment_method"] = payment_method
        
        payments = get_all_fee_payments(filters)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(payments)} fee payments")
        return [convert_objectids(payment) for payment in payments]
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to list payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list payments")

@router.get("/{payment_id}", response_model=dict)
async def get_fee_payment(
    payment_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee payment by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching payment {payment_id}")
    
    try:
        payment = get_fee_payment_by_id(payment_id, school_id=school_id)
        if not payment:
            logger.error(f"[SCHOOL:{school_id}] ❌ Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved payment {payment_id}")
        return convert_objectids(payment)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment")

@router.get("/student/{student_id}", response_model=List[dict])
async def get_student_fee_payments(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments for a student"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching payments for student {student_id}")
    
    try:
        payments = get_fee_payments_for_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(payments)} payments for student")
        return [convert_objectids(payment) for payment in payments]
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching student payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch student payments")

@router.get("/class/{class_id}", response_model=List[dict])
async def get_class_fee_payments(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fee payments for a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching payments for class {class_id}")
    
    try:
        payments = get_fee_payments_for_class(class_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(payments)} payments for class")
        return [convert_objectids(payment) for payment in payments]
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching class payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch class payments")

@router.get("/student/{student_id}/summary", response_model=dict)
async def get_student_fee_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee payment summary for a student"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching payment summary for student")
    
    try:
        summary = get_fee_payment_summary_for_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved payment summary")
        return summary
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment summary")

@router.put("/{payment_id}", response_model=dict)
async def update_fee_payment_record(
    payment_id: str,
    update_data: FeePaymentUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update a fee payment"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating payment {payment_id}")
    
    try:
        updated = update_fee_payment(payment_id, update_data.dict(exclude_unset=True), school_id=school_id)
        if not updated:
            logger.error(f"[SCHOOL:{school_id}] ❌ Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found or update failed")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated payment {payment_id}")
        return convert_objectids(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error updating payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update payment")

@router.delete("/{payment_id}")
async def delete_fee_payment_record(
    payment_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Delete a fee payment"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting payment {payment_id}")
    
    try:
        success = delete_fee_payment(payment_id, school_id=school_id)
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ Payment {payment_id} not found")
            raise HTTPException(status_code=404, detail="Payment not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Deleted payment {payment_id}")
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error deleting payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete payment")