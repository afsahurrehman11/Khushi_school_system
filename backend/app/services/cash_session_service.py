"""
Cash Session Management Service
Handles opening/closing balances, cash tracking, and reconciliation for accountants/admins
"""
from datetime import datetime, date
from typing import Optional, Dict, List
from app.database import get_db
from bson import ObjectId
import logging
import traceback

logger = logging.getLogger(__name__)

def get_or_create_session(user_id: str, school_id: str) -> dict:
    """
    Get active cash session for user or create one if doesn't exist
    """
    logger.info(f"[CASH_SESSION] get_or_create_session called - user_id: {user_id}, school_id: {school_id}")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        
        # Check if there's a session for today (any status except closed)
        logger.info(f"[CASH_SESSION] Checking for existing session on {today}")
        session = db.cash_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": {"$ne": "closed"}
        })
        
        if session:
            session["id"] = str(session.pop("_id"))
            logger.info(f"[CASH_SESSION] ✅ Found existing session: {session['id']}, Status: {session['status']}")
            return session
        
        # Check if there's a previous session to get closing balance as opening balance
        logger.info(f"[CASH_SESSION] No active session found, checking for previous session")
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
            logger.info(f"[CASH_SESSION] Using previous session closing balance as opening: {opening_balance}")
        else:
            logger.info(f"[CASH_SESSION] No previous session found, starting with 0 balance")
        
        # Create new session (inactive by default - user must activate)
        now = datetime.utcnow().isoformat()
        new_session = {
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "opening_balance": opening_balance,
            "opening_balance_by_method": opening_balance_by_method,
            "current_balance": opening_balance,
            "current_balance_by_method": opening_balance_by_method.copy(),
            "status": "inactive",
            "started_at": now,
            "created_at": now,
            "updated_at": now
        }
        
        result = db.cash_sessions.insert_one(new_session)
        new_session["id"] = str(result.inserted_id)
        new_session.pop("_id", None)
        
        logger.info(f"[CASH_SESSION] ✅ Created new session: {new_session['id']} for user {user_id} on {today}")
        return new_session
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error in get_or_create_session: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_session_by_id(session_id: str) -> Optional[dict]:
    """Get session by ID"""
    logger.info(f"[CASH_SESSION] get_session_by_id called - session_id: {session_id}")
    
    try:
        db = get_db()
        session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
        if session:
            session["id"] = str(session.pop("_id"))
            logger.info(f"[CASH_SESSION] ✅ Session found: {session_id}")
        else:
            logger.warn(f"[CASH_SESSION] ⚠️ Session not found: {session_id}")
        return session
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting session {session_id}: {str(e)}")
        raise


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
    logger.info(f"[CASH_SESSION] record_transaction called - session: {session_id}, amount: {amount}, method: {payment_method}")
    
    try:
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
        logger.info(f"[CASH_SESSION] ✅ Transaction created: {transaction['id']}")
        
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
            
            logger.info(f"[CASH_SESSION] ✅ Session balance updated: {current_balance} (added {amount} via {payment_method})")
        else:
            logger.warning(f"[CASH_SESSION] ⚠️ Session {session_id} not found for balance update")
        
        return transaction
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error recording transaction: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_session_transactions(session_id: str) -> List[dict]:
    """Get all transactions for a session"""
    logger.info(f"[CASH_SESSION] get_session_transactions called - session_id: {session_id}")
    
    try:
        db = get_db()
        transactions = list(db.cash_transactions.find({"session_id": session_id}).sort("timestamp", 1))
        for t in transactions:
            t["id"] = str(t.pop("_id"))
        
        logger.info(f"[CASH_SESSION] ✅ Found {len(transactions)} transactions for session {session_id}")
        return transactions
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting transactions: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_session_summary(session_id: str) -> dict:
    """Get session summary with breakdown by payment method"""
    logger.info(f"[CASH_SESSION] get_session_summary called - session_id: {session_id}")
    
    try:
        db = get_db()
        session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
        
        if not session:
            logger.warning(f"[CASH_SESSION] ⚠️ Session not found: {session_id}")
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
        
        logger.info(f"[CASH_SESSION] ✅ Session summary - {total_transactions} transactions, Status: {session.get('status')}")
        
        return {
            "session": session,
            "total_transactions": total_transactions,
            "breakdown_by_method": breakdown_by_method
        }
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting session summary: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def close_session(
    session_id: str,
    closing_balance_by_method: Dict[str, float],
    discrepancy_notes: Optional[str],
    verified_by: str
) -> dict:
    """
    Close a cash session with reconciliation
    """
    logger.info(f"[CASH_SESSION] close_session called - session_id: {session_id}, verified_by: {verified_by}")
    logger.info(f"[CASH_SESSION] Closing balances: {closing_balance_by_method}")
    
    try:
        db = get_db()
        now = datetime.utcnow().isoformat()
        
        session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            logger.error(f"[CASH_SESSION] ❌ Session not found: {session_id}")
            raise ValueError("Session not found")
        
        if session.get("status") == "closed":
            logger.error(f"[CASH_SESSION] ❌ Session already closed: {session_id}")
            raise ValueError("Session already closed")
        
        # Calculate expected vs actual
        expected = session.get("current_balance_by_method", {})
        actual = closing_balance_by_method
        
        logger.info(f"[CASH_SESSION] Expected balances: {expected}")
        logger.info(f"[CASH_SESSION] Actual balances: {actual}")
        
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
            
            if discrepancy_by_method[method] != 0:
                logger.warning(f"[CASH_SESSION] ⚠️ Discrepancy in {method}: Expected {exp}, Actual {act}, Diff: {discrepancy_by_method[method]}")
        
        total_discrepancy = total_actual - total_expected
        
        if total_discrepancy != 0:
            logger.warning(f"[CASH_SESSION] ⚠️ TOTAL DISCREPANCY: {total_discrepancy}")
            if discrepancy_notes:
                logger.info(f"[CASH_SESSION] Discrepancy notes: {discrepancy_notes}")
        
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
        
        logger.info(f"[CASH_SESSION] ✅ Session {session_id} CLOSED - Total: {total_actual}, Discrepancy: {total_discrepancy}")
        
        # Return updated session
        session = db.cash_sessions.find_one({"_id": ObjectId(session_id)})
        session["id"] = str(session.pop("_id"))
        return session
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error closing session: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_user_sessions(user_id: str, school_id: str, limit: int = 10) -> List[dict]:
    """Get user's cash session history"""
    logger.info(f"[CASH_SESSION] get_user_sessions called - user_id: {user_id}, school_id: {school_id}, limit: {limit}")
    
    try:
        db = get_db()
        sessions = list(
            db.cash_sessions.find({
                "user_id": user_id,
                "school_id": school_id
            }).sort("started_at", -1).limit(limit)
        )
        
        for s in sessions:
            s["id"] = str(s.pop("_id"))
        
        logger.info(f"[CASH_SESSION] ✅ Found {len(sessions)} sessions for user {user_id}")
        return sessions
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting user sessions: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_all_active_sessions(school_id: str) -> List[dict]:
    """Get all active sessions for a school (for admin oversight)"""
    logger.info(f"[CASH_SESSION] get_all_active_sessions called - school_id: {school_id}")
    
    try:
        db = get_db()
        sessions = list(
            db.cash_sessions.find({
                "school_id": school_id,
                "status": "active"
            }).sort("started_at", -1)
        )
        
        for s in sessions:
            s["id"] = str(s.pop("_id"))
        
        logger.info(f"[CASH_SESSION] ✅ Found {len(sessions)} active sessions for school {school_id}")
        return sessions
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting active sessions: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_all_accountant_stats(school_id: str, date_filter: str = None) -> List[dict]:
    """
    Get comprehensive stats for all accountants in a school.
    Used by admins for oversight dashboard.
    """
    filter_date = date_filter or date.today().isoformat()
    logger.info(f"[CASH_SESSION] get_all_accountant_stats called - school_id: {school_id}, date: {filter_date}")
    
    try:
        db = get_db()
        
        # Find all cash sessions for this date
        sessions = list(db.cash_sessions.find({
            "school_id": school_id,
            "session_date": filter_date
        }))
        
        logger.info(f"[CASH_SESSION] Found {len(sessions)} sessions for date {filter_date}")
        
        # Get all unique user IDs
        user_ids = list(set(s.get("user_id") for s in sessions))
        
        # Get user details from global_users (need to access via saas_root_db)
        from app.database import get_saas_root_db
        saas_db = get_saas_root_db()
        
        users = {}
        if user_ids:
            for user in saas_db.global_users.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids]}}):
                users[str(user["_id"])] = {
                    "id": str(user["_id"]),
                    "name": user.get("name", "Unknown"),
                    "email": user.get("email", ""),
                    "role": user.get("role", "Accountant")
                }
            logger.info(f"[CASH_SESSION] Resolved {len(users)} user details")
        
        # Build stats per accountant
        accountant_stats = []
        for session in sessions:
            user_id = session.get("user_id")
            user_info = users.get(user_id, {"id": user_id, "name": "Unknown", "email": "", "role": "Accountant"})
            
            # Get transactions for this session
            session_id = str(session.get("_id"))
            transactions = list(db.cash_transactions.find({"session_id": session_id}))
            
            # Calculate breakdown
            breakdown_by_method = {}
            for t in transactions:
                method = t['payment_method']
                amount = t['amount']
                if method not in breakdown_by_method:
                    breakdown_by_method[method] = {"count": 0, "total": 0.0}
                breakdown_by_method[method]["count"] += 1
                breakdown_by_method[method]["total"] += amount
            
            opening_balance = session.get("opening_balance", 0.0)
            current_balance = session.get("current_balance", 0.0)
            collected = current_balance - opening_balance
            
            stat = {
                "user": user_info,
                "session_id": session_id,
                "session_date": session.get("session_date"),
                "status": session.get("status", "active"),
                "opening_balance": opening_balance,
                "current_balance": current_balance,
                "collected_today": collected,
                "total_transactions": len(transactions),
                "breakdown_by_method": breakdown_by_method,
                "opening_balance_by_method": session.get("opening_balance_by_method", {}),
                "current_balance_by_method": session.get("current_balance_by_method", {}),
                "discrepancy": session.get("discrepancy"),
                "discrepancy_by_method": session.get("discrepancy_by_method"),
                "started_at": session.get("started_at"),
                "closed_at": session.get("closed_at")
            }
            
            accountant_stats.append(stat)
            logger.debug(f"[CASH_SESSION] Stat for {user_info.get('name')}: collected={collected}, transactions={len(transactions)}")
        
        logger.info(f"[CASH_SESSION] ✅ Retrieved stats for {len(accountant_stats)} accountants on {filter_date}")
        return accountant_stats
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting accountant stats: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise


def get_school_daily_summary(school_id: str, date_filter: str = None) -> dict:
    """
    Get aggregated daily summary for entire school.
    Combines all accountants' collections.
    """
    filter_date = date_filter or date.today().isoformat()
    logger.info(f"[CASH_SESSION] get_school_daily_summary called - school_id: {school_id}, date: {filter_date}")
    
    try:
        db = get_db()
        
        # Get all sessions for this date
        sessions = list(db.cash_sessions.find({
            "school_id": school_id,
            "session_date": filter_date
        }))
        
        logger.info(f"[CASH_SESSION] Found {len(sessions)} sessions for daily summary")
        
        total_opening = 0.0
        total_current = 0.0
        total_collected = 0.0
        total_transactions = 0
        combined_by_method = {}
        active_sessions = 0
        closed_sessions = 0
        
        for session in sessions:
            session_id = str(session.get("_id"))
            opening = session.get("opening_balance", 0.0)
            current = session.get("current_balance", 0.0)
            
            total_opening += opening
            total_current += current
            total_collected += (current - opening)
            
            if session.get("status") == "active":
                active_sessions += 1
            else:
                closed_sessions += 1
            
            # Aggregate by method
            balance_by_method = session.get("current_balance_by_method", {})
            for method, amount in balance_by_method.items():
                if method not in combined_by_method:
                    combined_by_method[method] = 0.0
                combined_by_method[method] += amount
            
            # Count transactions
            transactions = db.cash_transactions.count_documents({"session_id": session_id})
            total_transactions += transactions
        
        summary = {
            "date": filter_date,
            "school_id": school_id,
            "total_accountants": len(sessions),
            "active_sessions": active_sessions,
            "closed_sessions": closed_sessions,
            "total_opening_balance": total_opening,
            "total_current_balance": total_current,
            "total_collected": total_collected,
            "total_transactions": total_transactions,
            "breakdown_by_method": combined_by_method
        }
        
        logger.info(f"[CASH_SESSION] ✅ School daily summary: {total_collected} collected, {active_sessions} active, {closed_sessions} closed")
        return summary
        
    except Exception as e:
        logger.error(f"[CASH_SESSION] ❌ Error getting school daily summary: {str(e)}")
        logger.error(f"[CASH_SESSION] Traceback: {traceback.format_exc()}")
        raise
