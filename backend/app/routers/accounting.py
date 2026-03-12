from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.dependencies.auth import check_permission
from app.services.fee import get_all_fees
from app.services.payment import get_payments
from app.services.accounting_service import (
    open_accounting_session,
    get_active_accounting_session,
    get_accounting_session_by_id,
    close_accounting_session,
    get_accountant_balance,
    get_accounting_sessions,
    create_ledger_entry,
    get_ledger_entries,
    create_principal_payment,
    approve_principal_payment,
    reject_principal_payment,
    get_principal_payments,
    is_session_open
)
from app.database import get_db
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== REQUEST MODELS ====================

class OpenSessionRequest(BaseModel):
    opening_balance: float = 0.0
    notes: Optional[str] = None


class CloseSessionRequest(BaseModel):
    closing_balance: Optional[float] = None
    notes: Optional[str] = None


class AdminCashSubmissionRequest(BaseModel):
    amount: float
    payment_method: str = "CASH"
    notes: Optional[str] = None


class RejectPaymentRequest(BaseModel):
    rejection_reason: str


# ==================== ACCOUNTING SESSION ENDPOINTS ====================

@router.post("/accounting/session/open")
async def open_session(
    request: OpenSessionRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """
    Open a new accounting session for today.
    Only one open session per accountant per day.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    user_name = current_user.get("name", "Unknown")
    role = current_user.get("role", "accountant")
    school_id = current_user.get("school_id")
    
    logger.info(f"📂 User {user_name} opening accounting session")
    
    try:
        session = open_accounting_session(
            user_id=user_id,
            user_name=user_name,
            role=role,
            school_id=school_id,
            opening_balance=request.opening_balance,
            notes=request.notes
        )
        logger.info(f"📂 Accounting session opened: {session.get('id')}")
        return session
    except ValueError as e:
        logger.warning(f"⚠️ Cannot open session: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error opening session: {e}")
        raise HTTPException(status_code=500, detail="Failed to open accounting session")


@router.get("/accounting/session/current")
async def get_current_session(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get the current active accounting session for today.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    school_id = current_user.get("school_id")
    
    logger.info(f"📂 Getting current accounting session for user {user_id}")
    
    try:
        session = get_active_accounting_session(user_id, school_id)
        if not session:
            return {"message": "No active session", "session": None}
        return session
    except Exception as e:
        logger.error(f"❌ Error getting current session: {e}")
        raise HTTPException(status_code=500, detail="Failed to get current session")


@router.get("/accounting/session/{session_id}")
async def get_session_by_id(
    session_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get accounting session by ID.
    """
    logger.info(f"📂 Getting accounting session: {session_id}")
    
    try:
        session = get_accounting_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting session: {e}")
        raise HTTPException(status_code=500, detail="Failed to get session")


@router.post("/accounting/session/close")
async def close_session(
    request: CloseSessionRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """
    Close the current accounting session.
    Calculates totals, verifies outstanding balance, and locks session.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    school_id = current_user.get("school_id")
    user_name = current_user.get("name", "Unknown")
    
    logger.info(f"🔒 User {user_name} closing accounting session")
    
    try:
        # Get current session
        session = get_active_accounting_session(user_id, school_id)
        if not session:
            raise HTTPException(status_code=404, detail="No active session to close")
        
        closed_session = close_accounting_session(
            session_id=session["id"],
            closing_balance=request.closing_balance,
            notes=request.notes
        )
        
        logger.info(f"🔒 Session closed successfully: {closed_session.get('id')}")
        return closed_session
    except ValueError as e:
        logger.warning(f"⚠️ Cannot close session: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error closing session: {e}")
        raise HTTPException(status_code=500, detail="Failed to close session")


@router.get("/accounting/sessions")
async def list_sessions(
    status: Optional[str] = Query(None, description="Filter by status: OPEN or CLOSED"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    start_date: Optional[str] = Query(None, description="Start date filter YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date filter YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    """
    List accounting sessions with filtering.
    Admin can see all sessions, accountants see only their own.
    """
    school_id = current_user.get("school_id")
    current_role = current_user.get("role", "").lower()
    current_user_id = current_user.get("id") or current_user.get("sub")
    
    # Non-admin users can only see their own sessions
    if current_role not in ["admin", "root"]:
        user_id = current_user_id
    
    logger.info(f"📂 Listing accounting sessions for school {school_id}")
    
    try:
        result = get_accounting_sessions(
            school_id=school_id,
            user_id=user_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
            page=page,
            page_size=page_size
        )
        return result
    except Exception as e:
        logger.error(f"❌ Error listing sessions: {e}")
        raise HTTPException(status_code=500, detail="Failed to list sessions")


# ==================== ACCOUNTANT BALANCE ENDPOINT ====================

@router.get("/accounting/accountant-balance")
async def get_balance(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get accountant's current balance.
    Returns: collected_today, submitted_to_admin, outstanding_balance
    """
    user_id = current_user.get("id") or current_user.get("sub")
    school_id = current_user.get("school_id")
    
    logger.info(f"💰 Getting accountant balance for user {user_id}")
    
    try:
        balance = get_accountant_balance(user_id, school_id)
        logger.info(f"💰 Accountant balance calculated")
        return balance
    except Exception as e:
        logger.error(f"❌ Error getting accountant balance: {e}")
        raise HTTPException(status_code=500, detail="Failed to get accountant balance")


# ==================== LEDGER ENDPOINTS ====================

@router.get("/accounting/ledger")
async def list_ledger_entries(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    transaction_type: Optional[str] = Query(None, description="Filter by type: STUDENT_PAYMENT, SUBMIT_TO_ADMIN, ADJUSTMENT"),
    start_date: Optional[str] = Query(None, description="Start date filter"),
    end_date: Optional[str] = Query(None, description="End date filter"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    """
    Get ledger entries with filtering.
    """
    school_id = current_user.get("school_id")
    current_role = current_user.get("role", "").lower()
    user_id = current_user.get("id") or current_user.get("sub")
    
    # Non-admin users can only see their own ledger
    filter_user_id = user_id if current_role not in ["admin", "root"] else None
    
    logger.info(f"📒 Getting ledger entries for school {school_id}")
    
    try:
        result = get_ledger_entries(
            school_id=school_id,
            user_id=filter_user_id,
            session_id=session_id,
            transaction_type=transaction_type,
            start_date=start_date,
            end_date=end_date,
            page=page,
            page_size=page_size
        )
        return result
    except Exception as e:
        logger.error(f"❌ Error getting ledger entries: {e}")
        raise HTTPException(status_code=500, detail="Failed to get ledger entries")


# ==================== ADMIN CASH SUBMISSION ENDPOINTS ====================

@router.post("/admin-cash-submissions")
async def create_cash_submission(
    request: AdminCashSubmissionRequest,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """
    Create an admin cash submission request.
    Accountant requests to transfer collected cash to admin for verification.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    user_name = current_user.get("name", "Unknown")
    school_id = current_user.get("school_id")
    
    logger.info(f"💸 User {user_name} creating admin cash submission for {request.amount}")
    
    try:
        # Get current session
        session = get_active_accounting_session(user_id, school_id)
        if not session:
            logger.warning(f"⚠️ Payment blocked due to no active session")
            raise HTTPException(status_code=400, detail="You must have an active session to submit cash to admin")
        
        if session.get("status") == "CLOSED":
            logger.warning(f"⚠️ Payment blocked due to closed session")
            raise HTTPException(status_code=400, detail="Session is closed for today")
        
        payment = create_admin_cash_submission(
            school_id=school_id,
            session_id=session["id"],
            accountant_id=user_id,
            accountant_name=user_name,
            amount=request.amount,
            payment_method=request.payment_method,
            notes=request.notes
        )
        
        logger.info(f"\ud83d\udcb8 Admin cash submission created: {payment.get('id')}")
        return payment
    except ValueError as e:
        logger.warning(f"\u26a0\ufe0f Invalid cash submission: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error creating admin cash submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to create cash submission")


@router.get("/admin-cash-submissions")
async def list_cash_submissions(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    accountant_id: Optional[str] = Query(None, description="Filter by accountant ID"),
    status: Optional[str] = Query(None, description="Filter by status: PENDING, APPROVED, REJECTED"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    List admin cash submissions with filtering.
    Admin sees all, accountants see their own.
    """
    school_id = current_user.get("school_id")
    current_role = current_user.get("role", "").lower()
    user_id = current_user.get("id") or current_user.get("sub")
    
    # Non-admin users can only see their own payments
    if current_role not in ["admin", "root"]:
        accountant_id = user_id
    
    logger.info(f"💸 Listing admin cash submissions for school {school_id}")
    
    try:
        result = get_admin_cash_submissions(
            school_id=school_id,
            session_id=session_id,
            accountant_id=accountant_id,
            status=status,
            page=page,
            page_size=page_size
        )
        return result
    except Exception as e:
        logger.error(f"❌ Error listing admin cash submissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cash submissions")


@router.post("/admin-cash-submissions/{payment_id}/approve")
async def approve_cash_submission(
    payment_id: str,
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    """
    Admin approves an admin cash submission.
    Updates session stats and creates ledger entry.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    user_name = current_user.get("name", "Unknown")
    school_id = current_user.get("school_id")
    role = current_user.get("role", "").lower()
    
    # Only admin can approve
    if role not in ["admin", "root"]:
        logger.warning(f"⚠️ Unauthorized approval attempt by {role}")
        raise HTTPException(status_code=403, detail="Only admin can approve cash submissions")
    
    logger.info(f"✅ Admin {user_name} approving cash submission {payment_id}")
    
    try:
        payment = approve_admin_cash_submission(
            payment_id=payment_id,
            approved_by=user_id,
            approved_by_name=user_name,
            school_id=school_id
        )
        logger.info(f"✅ Admin cash submission approved: {payment_id}")
        return payment
    except ValueError as e:
        logger.warning(f"⚠️ Cannot approve cash submission: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error approving cash submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to approve cash submission")


@router.post("/admin-cash-submissions/{payment_id}/reject")
async def reject_cash_submission(
    payment_id: str,
    request: RejectPaymentRequest,
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    """
    Admin rejects an admin cash submission.
    """
    user_id = current_user.get("id") or current_user.get("sub")
    user_name = current_user.get("name", "Unknown")
    school_id = current_user.get("school_id")
    role = current_user.get("role", "").lower()
    
    # Only admin can reject
    if role not in ["admin", "root"]:
        logger.warning(f"⚠️ Unauthorized rejection attempt by {role}")
        raise HTTPException(status_code=403, detail="Only admin can reject cash submissions")
    
    logger.info(f"❌ Admin {user_name} rejecting cash submission {payment_id}")
    
    try:
        payment = reject_admin_cash_submission(
            payment_id=payment_id,
            rejected_by=user_id,
            rejection_reason=request.rejection_reason,
            school_id=school_id
        )
        logger.info(f"❌ Admin cash submission rejected: {payment_id}")
        return payment
    except ValueError as e:
        logger.warning(f"⚠️ Cannot reject cash submission: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error rejecting cash submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to reject cash submission")


@router.get("/accounting/summary")
async def accounting_summary(
    start: Optional[str] = Query(None, description="start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="end date YYYY-MM-DD"),
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    """Get accounting summary for school"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching accounting summary")
    
    try:
        db = get_db()

        # parse dates if provided
        start_dt = None
        end_dt = None
        try:
            if start:
                start_dt = datetime.fromisoformat(start)
            if end:
                end_dt = datetime.fromisoformat(end)
        except Exception:
            logger.error(f"[SCHOOL:{school_id}] ❌ Invalid date format")
            raise HTTPException(status_code=400, detail="Invalid date format")

        # build fee query with school isolation
        fee_query = {"school_id": school_id} if school_id else {}
        if start_dt or end_dt:
            fee_query["created_at"] = {}
            if start_dt:
                fee_query["created_at"]["$gte"] = start_dt
            if end_dt:
                fee_query["created_at"]["$lte"] = end_dt

        fees = list(db.fees.find(fee_query))
        total_fees = sum(float(f.get("amount", 0)) for f in fees)
        total_pending = sum(float(f.get("amount", 0)) for f in fees if f.get("status") != "paid")
        total_paid = sum(float(f.get("amount", 0)) for f in fees if f.get("status") == "paid")

        # class-wise summary
        class_summary = {}
        for f in fees:
            cls = f.get("class_id") or "Unassigned"
            cls_entry = class_summary.setdefault(cls, {"total": 0.0, "paid": 0.0, "pending": 0.0})
            amt = float(f.get("amount", 0))
            cls_entry["total"] += amt
            if f.get("status") == "paid":
                cls_entry["paid"] += amt
            else:
                cls_entry["pending"] += amt

        logger.info(f"[SCHOOL:{school_id}] ✅ Accounting summary retrieved")
        return {
            "total_fees": total_fees,
            "total_paid": total_paid,
            "total_pending": total_pending,
            "class_summary": class_summary,
            "period": {"start": start, "end": end}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching accounting summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch accounting summary")
