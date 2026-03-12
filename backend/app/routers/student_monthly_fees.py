"""
Student Monthly Fees Router - M2, M3, M4 API Endpoints
Handles scholarship management, monthly fee generation, and payment processing
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
import logging
from datetime import datetime

from app.dependencies.auth import check_permission
from app.services.student_fee_service import (
    # M2 - Scholarship
    get_student_scholarship,
    update_student_scholarship,
    update_student_arrears,
    
    # M3 - Monthly Fees
    generate_monthly_fee,
    generate_monthly_fees_for_class,
    get_student_monthly_fees,
    get_monthly_fee_by_id,
    get_fee_summary,
    get_current_month_fee,
    get_student_base_fee,
    
    # M4 - Payments
    create_payment,
    get_student_payments,
    get_payment_summary,
    get_payments_for_fee,
    
    # Overview
    get_student_fee_overview,
    
    # Arrears
    carry_forward_arrears,
    
    # Charts (M6)
    get_payment_chart_data
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/student-fees", tags=["Student Monthly Fees"])

# ==================== REQUEST MODELS ====================

class UpdateScholarshipRequest(BaseModel):
    scholarship_percent: float

class UpdateArrearsRequest(BaseModel):
    arrears_balance: float

class GenerateMonthlyFeeRequest(BaseModel):
    month: int
    year: int

class GenerateClassFeesRequest(BaseModel):
    class_id: str
    month: int
    year: int

class CreatePaymentRequest(BaseModel):
    monthly_fee_id: str
    amount: float
    payment_method: str = "CASH"
    payment_method_id: Optional[str] = None  # Reference to payment_methods collection
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class StudentIdsRequest(BaseModel):
    student_ids: List[str]

# ==================== M2: SCHOLARSHIP ENDPOINTS ====================

@router.get("/scholarship/{student_id}")
async def get_scholarship(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get student's scholarship percentage and arrears balance"""
    school_id = current_user.get("school_id")
    
    try:
        result = get_student_scholarship(student_id, school_id)
        if not result:
            raise HTTPException(status_code=404, detail="Student not found")
        return result
    except Exception as e:
        logger.error(f"Failed to get scholarship: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/scholarship/{student_id}")
async def update_scholarship(
    student_id: str,
    request: UpdateScholarshipRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update student's scholarship percentage"""
    school_id = current_user.get("school_id")
    
    try:
        success = update_student_scholarship(student_id, school_id, request.scholarship_percent)
        if not success:
            raise HTTPException(status_code=404, detail="Student not found or update failed")
        
        logger.info(f"Updated scholarship for {student_id} to {request.scholarship_percent}%")
        return {"success": True, "scholarship_percent": request.scholarship_percent}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update scholarship: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/arrears/{student_id}")
async def update_arrears(
    student_id: str,
    request: UpdateArrearsRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update student's arrears balance"""
    school_id = current_user.get("school_id")
    
    try:
        success = update_student_arrears(student_id, school_id, request.arrears_balance)
        if not success:
            raise HTTPException(status_code=404, detail="Student not found or update failed")
        
        return {"success": True, "arrears_balance": request.arrears_balance}
    except Exception as e:
        logger.error(f"Failed to update arrears: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== M3: MONTHLY FEE ENDPOINTS ====================

@router.post("/generate/{student_id}")
async def generate_fee(
    student_id: str,
    request: GenerateMonthlyFeeRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Generate monthly fee for a student"""
    school_id = current_user.get("school_id")
    # Build a small received_by audit payload with user context
    received_by = {
        "id": current_user.get("id"),
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "role": current_user.get("role")
    }
    
    try:
        fee = generate_monthly_fee(
            student_id,
            school_id,
            request.month,
            request.year,
            user_id
        )
        return fee
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate fee: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-class")
async def generate_class_fees(
    request: GenerateClassFeesRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Generate monthly fees for all students in a class"""
    school_id = current_user.get("school_id")
    user_id = current_user.get("sub")
    
    try:
        fees = generate_monthly_fees_for_class(
            request.class_id,
            school_id,
            request.month,
            request.year,
            user_id
        )
        return {
            "generated_count": len(fees),
            "fees": fees
        }
    except Exception as e:
        logger.error(f"Failed to generate class fees: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/monthly/{student_id}")
async def get_monthly_fees(
    student_id: str,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get paginated monthly fees for a student"""
    school_id = current_user.get("school_id")
    
    try:
        return get_student_monthly_fees(
            student_id, school_id, year, status, page, page_size
        )
    except Exception as e:
        logger.error(f"Failed to get monthly fees: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/monthly/{student_id}/current")
async def get_current_fee(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get current month's fee for a student"""
    school_id = current_user.get("school_id")
    
    try:
        fee = get_current_month_fee(student_id, school_id)
        if not fee:
            # Auto-generate if not exists
            now = datetime.utcnow()
            fee = generate_monthly_fee(
                student_id,
                school_id,
                now.month,
                now.year,
                current_user.get("sub")
            )
        return fee
    except Exception as e:
        logger.error(f"Failed to get current fee: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/fee/{fee_id}")
async def get_fee_detail(
    fee_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get detailed monthly fee record"""
    school_id = current_user.get("school_id")
    
    try:
        fee = get_monthly_fee_by_id(fee_id, school_id)
        if not fee:
            raise HTTPException(status_code=404, detail="Fee record not found")
        
        # Include payments for this fee
        payments = get_payments_for_fee(fee_id, school_id)
        fee["payments"] = payments
        
        return fee
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get fee detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/summary/{student_id}")
async def get_student_fee_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee summary statistics for a student"""
    school_id = current_user.get("school_id")
    
    try:
        return get_fee_summary(student_id, school_id)
    except Exception as e:
        logger.error(f"Failed to get fee summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/base-fee/{student_id}")
async def get_base_fee(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get student's base fee from class assignment"""
    school_id = current_user.get("school_id")
    
    try:
        base_fee = get_student_base_fee(student_id, school_id)
        return {"base_fee": base_fee}
    except Exception as e:
        logger.error(f"Failed to get base fee: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== M4: PAYMENT ENDPOINTS ====================

@router.post("/payments/{student_id}")
async def record_payment(
    student_id: str,
    request: CreatePaymentRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Record a payment for a monthly fee"""
    school_id = current_user.get("school_id")
    user_id = current_user.get("id") or current_user.get("sub")
    user_role = current_user.get("role", "").lower()
    user_name = current_user.get("name", "Unknown")
    
    # TASK 1: Fix received_by bug
    received_by = user_id
    logger.info(f"💰 Recording payment for student {student_id} by user {received_by}")
    
    # TASK 2: Enforce role permission (admin or accountant only)
    if user_role not in ["admin", "accountant"]:
        logger.warning(f"⚠️ Unauthorized payment attempt by role {user_role}")
        raise HTTPException(
            status_code=403,
            detail=f"Only admin and accountant roles can record payments. Your role: {user_role}"
        )
    
    # MODULE 2: Check accounting session first (new system)
    accounting_session_id = None
    try:
        from app.services.accounting_service import get_active_accounting_session
        accounting_session = get_active_accounting_session(user_id, school_id)
        if accounting_session and accounting_session.get("status") == "OPEN":
            accounting_session_id = accounting_session.get("id")
            logger.info(f"📂 Accounting session verified: {accounting_session_id}")
    except Exception as e:
        logger.warning(f"⚠️ Could not verify accounting session: {e}")
    
    # TASK 3: Enforce active cash session (existing system - backward compatible)
    from app.services.cash_session_service import get_or_create_session
    try:
        session = get_or_create_session(user_id, school_id)
        if session.get("status") != "active":
            # Check if accounting session is open instead
            if accounting_session_id:
                logger.info(f"✅ Using accounting session instead of cash session")
            else:
                logger.warning(f"⚠️ Payment blocked because session not active (status: {session.get('status')})")
                raise HTTPException(
                    status_code=403,
                    detail="You must open your accounting session before recording payments."
                )
        logger.info(f"🏫 Tenant database resolved for school {school_id}")
        logger.info(f"✅ Active session verified: {session.get('id')}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Session validation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate accounting session")
    
    # Use accounting session ID if available, otherwise use cash session ID
    session_id_to_use = accounting_session_id or session.get("id")
    
    try:
        payment = create_payment(
            school_id=school_id,
            student_id=student_id,
            monthly_fee_id=request.monthly_fee_id,
            amount=request.amount,
            payment_method=request.payment_method,
            transaction_reference=request.transaction_reference,
            notes=request.notes,
            received_by=received_by,
            received_by_name=user_name,
            received_by_role=user_role,
            session_id=session_id_to_use,
            payment_method_id=getattr(request, "payment_method_id", None)
        )
        logger.info(f"✅ Payment recorded successfully: {payment.get('id')}")
        return payment
    except ValueError as e:
        logger.error(f"❌ Payment validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Failed to record payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payments/{student_id}")
async def get_payments(
    student_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get paginated payment records for a student"""
    school_id = current_user.get("school_id")
    
    try:
        return get_student_payments(student_id, school_id, page, page_size)
    except Exception as e:
        logger.error(f"Failed to get payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payments/{student_id}/summary")
async def get_payments_summary(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get payment summary for a student"""
    school_id = current_user.get("school_id")
    
    try:
        return get_payment_summary(student_id, school_id)
    except Exception as e:
        logger.error(f"Failed to get payment summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== OVERVIEW ENDPOINT ====================

@router.get("/overview/{student_id}")
async def get_fee_overview(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get complete fee overview for a student (for Student Detail Page)"""
    school_id = current_user.get("school_id")
    
    try:
        overview = get_student_fee_overview(student_id, school_id)
        if not overview:
            raise HTTPException(status_code=404, detail="Student not found")
        return overview
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get fee overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/students/current-month-status")
async def get_students_current_month_status(
    request: StudentIdsRequest,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get current month fee status for multiple students (optimized for Student Cards Page).
    Returns a mapping of student_id -> current month fee data including status.
    """
    school_id = current_user.get("school_id")
    
    try:
        from app.services.student_fee_service import get_students_current_month_status
        
        logger.info(f"[SCHOOL:{school_id}] Fetching current month status for {len(request.student_ids)} students")
        
        results = get_students_current_month_status(request.student_ids, school_id)
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved status for {len(results)} students")
        return results
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to get current month status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ARREARS CARRYFORWARD ====================

@router.post("/carry-forward-arrears")
async def run_carry_forward_arrears(
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Carry forward unpaid fees as arrears (admin function)"""
    school_id = current_user.get("school_id")
    
    try:
        result = carry_forward_arrears(school_id)
        return result
    except Exception as e:
        logger.error(f"Failed to carry forward arrears: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== M6: CHART DATA ENDPOINTS ====================

@router.get("/charts/{student_id}")
async def get_charts(
    student_id: str,
    year: Optional[int] = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get chart data for payment visualizations"""
    school_id = current_user.get("school_id")
    
    try:
        return get_payment_chart_data(student_id, school_id, year)
    except Exception as e:
        logger.error(f"Failed to get chart data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
