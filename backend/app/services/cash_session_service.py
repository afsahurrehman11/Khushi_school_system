"""
Cash Session Management Service
Handles opening/closing balances, cash tracking, and reconciliation for accountants/admins
"""
from datetime import datetime, date
from typing import Optional, Dict, List
from app.database import get_db
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

def get_or_create_session(user_id: str, school_id: str) -> dict:
    """
    Get active cash session for user or create one if doesn't exist
    """
    db = get_db()
    today = date.today().isoformat()
    
    # Check if there's an active session for today
    session = db.cash_sessions.find_one({
        "user_id": user_id,
        "school_id": school_id,
        "session_date": today,
        "status": {"$in": ["active", "pending_reconciliation"]}
    })
    
    if session:
        session["id"] = str(session.pop("_id"))
        return session
    
    # Check if there's a previous session to get closing balance as opening balance
    previous_session = db.cash_sessions.find_one(
        {
            "user_id": user_id,
            "school_id": school_id,
            "status": "closed"
        },
        sort=[("closed_at", -1)]
    )
    
    opening_balance = 0.0
    opening_balance_by_method = {}
    
    if previous_session and previous_session.get("closing_balance_by_method"):
        opening_balance = previous_session.get("closing_balance", 0.0)
        opening_balance_by_method = previous_session.get("closing_balance_by_method", {})
    
    # Create new session
    now = datetime.utcnow().isoformat()
    new_session = {
        "user_id": user_id,
        "school_id": school_id,
        "session_date": today,
        "opening_balance": opening_balance,
        "opening_balance_by_method": opening_balance_by_method,
        "current_balance": opening_balance,
        "current_balance_by_method": opening_balance_by_method.copy(),
        "status": "active",
        "started_at": now,
        "created_at": now,
        "updated_at": now
    }
    
    result = db.cash_sessions.insert_one(new_session)
    new_session["id"] = str(result.inserted_id)
    new_session.pop("_id", None)
    
    logger.info(f"[SESSION] Created new cash session for user {user_id} on {today}")
    return new_session


def get_session_by_id(session_id: str) -> Optional[dict]:
    """Get session by ID"""
    db = get_db()
    session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
    if session:
        session["id"] = str(session.pop("_id"))
    return session


def record_transaction(
    session_id: str,
    user_id: str,
    school_id: str,
    payment_id: str,
    student_id: str,
    amount: float,
    payment_method: str,
    transaction_reference: Optional[str] = None
) -> dict:
    """
    Record a cash transaction and update session balance
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    
    # Create transaction record
    transaction = {
        "session_id": session_id,
        "user_id": user_id,
        "school_id": school_id,
        "payment_id": payment_id,
        "student_id": student_id,
        "amount": amount,
        "payment_method": payment_method,
        "transaction_reference": transaction_reference,
        "timestamp": now,
        "created_at": now
    }
    
    result = db.cash_transactions.insert_one(transaction)
    transaction["id"] = str(result.inserted_id)
    transaction.pop("_id", None)
    
    # Update session current balance
    session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
    if session:
        current_balance = session.get("current_balance", 0.0) + amount
        current_balance_by_method = session.get("current_balance_by_method", {})
        current_balance_by_method[payment_method] = current_balance_by_method.get(payment_method, 0.0) + amount
        
        db.cash_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "current_balance": current_balance,
                    "current_balance_by_method": current_balance_by_method,
                    "updated_at": now
                }
            }
        )
        
        logger.info(f"[TRANSACTION] Recorded {amount} via {payment_method} for session {session_id}")
    
    return transaction


def get_session_transactions(session_id: str) -> List[dict]:
    """Get all transactions for a session"""
    db = get_db()
    transactions = list(db.cash_transactions.find({"session_id": session_id}).sort("timestamp", 1))
    for t in transactions:
        t["id"] = str(t.pop("_id"))
    return transactions


def get_session_summary(session_id: str) -> dict:
    """Get session summary with breakdown by payment method"""
    db = get_db()
    session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
    
    if not session:
        return None
    
    transactions = list(db.cash_transactions.find({"session_id": session_id}))
    
    # Calculate statistics
    total_transactions = len(transactions)
    breakdown_by_method = {}
    
    for t in transactions:
        method = t['payment_method']
        amount = t['amount']
        if method not in breakdown_by_method:
            breakdown_by_method[method] = {"count": 0, "total": 0.0}
        breakdown_by_method[method]["count"] += 1
        breakdown_by_method[method]["total"] += amount
    
    session["id"] = str(session.pop("_id"))
    
    return {
        "session": session,
        "total_transactions": total_transactions,
        "breakdown_by_method": breakdown_by_method
    }


def close_session(
    session_id: str,
    closing_balance_by_method: Dict[str, float],
    discrepancy_notes: Optional[str],
    verified_by: str
) -> dict:
    """
    Close a cash session with reconciliation
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    
    session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise ValueError("Session not found")
    
    if session.get("status") == "closed":
        raise ValueError("Session already closed")
    
    # Calculate expected vs actual
    expected = session.get("current_balance_by_method", {})
    actual = closing_balance_by_method
    
    discrepancy_by_method = {}
    total_expected = 0.0
    total_actual = 0.0
    
    # Get all unique payment methods
    all_methods = set(list(expected.keys()) + list(actual.keys()))
    
    for method in all_methods:
        exp = expected.get(method, 0.0)
        act = actual.get(method, 0.0)
        discrepancy_by_method[method] = act - exp
        total_expected += exp
        total_actual += act
    
    total_discrepancy = total_actual - total_expected
    
    # Update session
    update = {
        "closing_balance": total_actual,
        "closing_balance_by_method": closing_balance_by_method,
        "discrepancy": total_discrepancy,
        "discrepancy_by_method": discrepancy_by_method,
        "discrepancy_notes": discrepancy_notes,
        "status": "closed",
        "closed_at": now,
        "updated_at": now,
        "verified_by": verified_by
    }
    
    db.cash_sessions.update_one({"_id": ObjectId(session_id)}, {"$set": update})
    
    logger.info(f"[SESSION] Closed session {session_id} with discrepancy: {total_discrepancy}")
    
    # Return updated session
    session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
    session["id"] = str(session.pop("_id"))
    return session


def get_user_sessions(user_id: str, school_id: str, limit: int = 10) -> List[dict]:
    """Get user's cash session history"""
    db = get_db()
    sessions = list(
        db.cash_sessions.find({
            "user_id": user_id,
            "school_id": school_id
        }).sort("started_at", -1).limit(limit)
    )
    
    for s in sessions:
        s["id"] = str(s.pop("_id"))
    
    return sessions


def get_all_active_sessions(school_id: str) -> List[dict]:
    """Get all active sessions for a school (for admin oversight)"""
    db = get_db()
    sessions = list(
        db.cash_sessions.find({
            "school_id": school_id,
            "status": "active"
        }).sort("started_at", -1)
    )
    
    for s in sessions:
        s["id"] = str(s.pop("_id"))
    
    return sessions
