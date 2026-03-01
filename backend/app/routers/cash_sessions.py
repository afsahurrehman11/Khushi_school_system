"""
Cash Session Management Router
Handles cash tracking, opening/closing balances, and reconciliation
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
import logging
from app.models.cash_session import (
    CashSessionCreate, CashSessionInDB, CashSessionClose, CashTransactionInDB
)
from app.services.cash_session_service import (
    get_or_create_session, get_session_by_id, get_session_summary,
    get_session_transactions, close_session, get_user_sessions, get_all_active_sessions,
    get_all_accountant_stats, get_school_daily_summary
)
from app.dependencies.auth import check_permission
from bson import ObjectId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cash-sessions", tags=["Cash Sessions"])


@router.get("/current")
async def get_current_session(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """ (inactive by default)
    """
    user_id = current_user.get("id")
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] User {email} requesting current session")
    
    try:
        session = get_or_create_session(user_id, school_id)
        logger.info(f"[CASH SESSION] ✅ Current session for {email}: {session.get('id')}, Status: {session.get('status')}")
        return session
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get current session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get current session")


@router.post("/current/activate")
async def activate_current_session(
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """
    Activate the current session for the logged-in user
    """
    from app.database import get_db
    from datetime import date
    
    user_id = current_user.get("id")
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    today = date.today().isoformat()
    
    logger.info(f"[CASH SESSION] User {email} activating session")
    
    try:
        db = get_db()
        
        # Find today's session
        session = db.cash_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": {"$ne": "closed"}
        })
        
        if not session:
            logger.error(f"[CASH SESSION] ❌ No session found to activate for {email}")
            raise HTTPException(status_code=404, detail="No session found to activate")
        
        if session.get("status") == "active":
            logger.info(f"[CASH SESSION] Session already active for {email}")
            session["id"] = str(session.pop("_id"))
            return session
        
        # Activate the session
        now = datetime.utcnow().isoformat()
        db.cash_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"status": "active", "activated_at": now, "updated_at": now}}
        )
        
        session = db.cash_sessions.find_one({"_id": session["_id"]})
        session["id"] = str(session.pop("_id"))
        
        logger.info(f"[CASH SESSION] ✅ Session activated for {email}: {session['id']}")
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to activate session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to activater(e)}")
        raise HTTPException(status_code=500, detail="Failed to get current session")


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get specific session by ID
    """
    logger.info(f"[CASH SESSION] Fetching session {session_id}")
    
    try:
        session = get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify user has access to this session
        user_id = current_user.get("id")
        school_id = current_user.get("school_id")
        
        if session.get("user_id") != user_id and session.get("school_id") != school_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session")


@router.get("/{session_id}/summary")
async def get_session_summary_endpoint(
    session_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get session summary with transaction breakdown by payment method
    """
    logger.info(f"[CASH SESSION] Fetching summary for session {session_id}")
    
    try:
        summary = get_session_summary(session_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify access
        user_id = current_user.get("id")
        school_id = current_user.get("school_id")
        session = summary.get("session", {})
        
        if session.get("user_id") != user_id and session.get("school_id") != school_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session summary")


@router.get("/{session_id}/transactions")
async def get_transactions(
    session_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get all transactions for a session
    """
    logger.info(f"[CASH SESSION] Fetching transactions for session {session_id}")
    
    try:
        session = get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify access
        user_id = current_user.get("id")
        school_id = current_user.get("school_id")
        
        if session.get("user_id") != user_id and session.get("school_id") != school_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        transactions = get_session_transactions(session_id)
        return transactions
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get transactions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get transactions")


@router.post("/{session_id}/close")
async def close_session_endpoint(
    session_id: str,
    payload: CashSessionClose,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """
    Close a cash session with reconciliation
    """
    user_id = current_user.get("id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] User {email} closing session {session_id}")
    
    try:
        session = get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify this is user's session
        if session.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Can only close your own session")
        
        closed_session = close_session(
            session_id,
            payload.closing_balance_by_method,
            payload.discrepancy_notes,
            email
        )
        
        logger.info(f"[CASH SESSION] ✅ Session {session_id} closed by {email}")
        return closed_session
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"[CASH SESSION] ❌ Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to close session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to close session")


@router.get("/user/history")
async def get_user_history(
    limit: int = 10,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get user's cash session history
    """
    user_id = current_user.get("id")
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] Fetching history for user {email}")
    
    try:
        sessions = get_user_sessions(user_id, school_id, limit)
        return sessions
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session history")


@router.get("/school/active")
async def get_school_active_sessions(
    current_user: dict = Depends(check_permission("reports.view"))
):
    """
    Get all active sessions for the school (admin oversight)
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] Admin {email} fetching all active sessions")
    
    try:
        sessions = get_all_active_sessions(school_id)
        return sessions
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get active sessions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get active sessions")


@router.get("/school/accountant-stats")
async def get_school_accountant_stats(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(check_permission("reports.view"))
):
    """
    Get all accountants' stats for a specific date (admin oversight).
    Returns individual stats for each accountant with payment method breakdown.
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] Admin {email} fetching accountant stats for date: {date or 'today'}")
    
    try:
        stats = get_all_accountant_stats(school_id, date)
        return stats
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get accountant stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get accountant stats")


@router.get("/school/daily-summary")
async def get_daily_summary(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(check_permission("reports.view"))
):
    """
    Get aggregated daily summary for the entire school.
    Combines all accountants' collections with total breakdown.
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[CASH SESSION] Admin {email} fetching school daily summary for date: {date or 'today'}")
    
    try:
        summary = get_school_daily_summary(school_id, date)
        return summary
    except Exception as e:
        logger.error(f"[CASH SESSION] ❌ Failed to get daily summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get daily summary")
