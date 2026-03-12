"""
Daily Workflow Router for MODULE 4
Session Closing, Verification, Admin Cash Submissions, and Audit Trail
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import Optional
from datetime import date
import logging

from app.dependencies.auth import get_current_user, require_role
from app.models.daily_workflow import (
    CloseSessionWithVerificationRequest,
    ClosedSessionSummary,
    DailySummaryResponse,
    PayPrincipalWorkflowRequest,
    ApprovePrincipalPaymentRequest,
    RejectPrincipalPaymentRequest,
    AllAccountantsDailyResponse
)
from app.services.daily_workflow_service import (
    get_daily_summary,
    close_session_with_verification,
    create_principal_payment_with_verification,
    get_pending_principal_payments,
    approve_principal_payment_with_verification,
    reject_principal_payment_with_verification,
    get_all_accountants_daily_overview,
    get_month_collection_details
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/daily-workflow", tags=["Daily Workflow"])


# ==================== DAILY SUMMARY ====================

@router.get("/summary")
async def get_accountant_daily_summary(
    target_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get daily summary for the current accountant.
    Includes all payments, balances, and admin cash submissions.
    """
    logger.info(f"📊 GET /daily-workflow/summary - user: {current_user.get('email')}")
    
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = get_daily_summary(
            user_id=user_id,
            school_id=school_id,
            target_date=target_date
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error(f"❌ Error getting daily summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/month-collection")
async def get_accountant_month_collection(
    current_user: dict = Depends(get_current_user)
):
    """
    Get month collection details for Pay Principal modal.
    Shows all payments collected this month.
    """
    logger.info(f"📅 GET /daily-workflow/month-collection - user: {current_user.get('email')}")
    
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = get_month_collection_details(
            user_id=user_id,
            school_id=school_id
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error(f"❌ Error getting month collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SESSION CLOSE ====================

@router.post("/close-session", response_model=None)
async def close_session_endpoint(
    request: CloseSessionWithVerificationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Close the current session with password verification.
    Creates audit trail and updates balances.
    """
    logger.info(f"🔒 POST /daily-workflow/close-session - user: {current_user.get('email')}")
    
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        user_email = current_user.get("email")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = close_session_with_verification(
            user_id=user_id,
            user_email=user_email,
            school_id=school_id,
            password=request.password,
            closing_balance=request.closing_balance,
            closing_balance_by_method=request.closing_balance_by_method or {},
            discrepancy_notes=request.discrepancy_notes
        )
        
        return {"success": True, "data": result}
        
    except ValueError as ve:
        logger.warning(f"🔒 Session close validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"❌ Error closing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ADMIN CASH SUBMISSION REQUEST ====================

@router.post("/submit-cash-to-admin")
async def request_admin_cash_submission(
    request: PayPrincipalWorkflowRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create an admin cash submission request with password verification.
    Requires session to be closed first.
    """
    logger.info(f"💸 POST /daily-workflow/submit-cash-to-admin - user: {current_user.get('email')}")
    
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name", "Unknown")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = create_principal_payment_with_verification(
            user_id=user_id,
            user_email=user_email,
            user_name=user_name,
            school_id=school_id,
            password=request.password,
            amount=request.amount,
            payment_method=request.payment_method,
            notes=request.notes,
            proof_attachment=request.proof_attachment
        )
        
        return {"success": True, "data": result}
        
    except ValueError as ve:
        logger.warning(f"💸 Admin cash submission validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"❌ Error creating admin cash submission: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ADMIN ENDPOINTS ====================

@router.get("/admin/pending-cash-submissions")
async def get_admin_pending_submissions(
    current_user: dict = Depends(require_role(["Admin", "Root"]))
):
    """
    Get all pending cash submissions for admin review.
    Admin/Root only.
    """
    logger.info(f"📋 GET /daily-workflow/admin/pending-cash-submissions - admin: {current_user.get('email')}")
    
    try:
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = get_pending_principal_payments(school_id)
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error(f"❌ Error getting pending payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/approve-cash-submission/{payment_id}")
async def approve_admin_cash_submission(
    payment_id: str = Path(...),
    request: ApprovePrincipalPaymentRequest = None,
    current_user: dict = Depends(require_role(["Admin", "Root"]))
):
    """
    Approve an admin cash submission with admin password verification.
    Admin/Root only.
    """
    logger.info(f"✅ POST /daily-workflow/admin/approve-cash-submission/{payment_id} - admin: {current_user.get('email')}")
    
    try:
        admin_id = current_user.get("id") or current_user.get("user_id")
        admin_email = current_user.get("email")
        admin_name = current_user.get("name", "Admin")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = approve_principal_payment_with_verification(
            payment_id=payment_id,
            admin_id=admin_id,
            admin_email=admin_email,
            admin_name=admin_name,
            school_id=school_id,
            password=request.password
        )
        
        return {"success": True, "data": result}
        
    except ValueError as ve:
        logger.warning(f"✅ Approval validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"❌ Error approving payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/reject-cash-submission/{payment_id}")
async def reject_admin_cash_submission(
    payment_id: str = Path(...),
    request: RejectPrincipalPaymentRequest = None,
    current_user: dict = Depends(require_role(["Admin", "Root"]))
):
    """
    Reject an admin cash submission with admin password verification.
    Admin/Root only.
    """
    logger.info(f"❌ POST /daily-workflow/admin/reject-cash-submission/{payment_id} - admin: {current_user.get('email')}")
    
    try:
        admin_id = current_user.get("id") or current_user.get("user_id")
        admin_email = current_user.get("email")
        admin_name = current_user.get("name", "Admin")
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = reject_principal_payment_with_verification(
            payment_id=payment_id,
            admin_id=admin_id,
            admin_email=admin_email,
            admin_name=admin_name,
            school_id=school_id,
            password=request.password,
            rejection_reason=request.rejection_reason
        )
        
        return {"success": True, "data": result}
        
    except ValueError as ve:
        logger.warning(f"❌ Rejection validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"❌ Error rejecting payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/all-accountants")
async def get_admin_all_accountants(
    target_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(require_role(["Admin", "Root"]))
):
    """
    Get overview of all accountants' daily activity.
    Admin/Root only.
    """
    logger.info(f"👥 GET /daily-workflow/admin/all-accountants - admin: {current_user.get('email')}")
    
    try:
        school_id = current_user.get("school_id")
        
        if not school_id:
            raise HTTPException(status_code=400, detail="School context required")
        
        result = get_all_accountants_daily_overview(
            school_id=school_id,
            target_date=target_date
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error(f"❌ Error getting all accountants overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
