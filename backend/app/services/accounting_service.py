"""
Accounting Engine Service for MODULE 2
Handles session lifecycle, ledger system, and admin cash submissions
"""
from datetime import datetime, date
from typing import Optional, Dict, List, Any
from app.database import get_db
from bson import ObjectId
import logging
import traceback

logger = logging.getLogger(__name__)


# ==================== ACCOUNTING SESSION MANAGEMENT ====================

def open_accounting_session(
    user_id: str,
    user_name: str,
    role: str,
    school_id: str,
    opening_balance: float = 0.0,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Open a new accounting session for today.
    Only one open session per accountant per day.
    """
    logger.info(f"📂 Opening accounting session for user {user_id}")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        now = datetime.utcnow()
        
        # Check if session already exists for today
        existing = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today
        })
        
        if existing:
            existing["id"] = str(existing.pop("_id"))
            logger.info(f"📂 Session already exists for today: {existing['id']}, status: {existing.get('status')}")
            
            if existing.get("status") == "OPEN":
                return existing
            else:
                raise ValueError("Session for today is already closed. Cannot reopen.")
        
        # Get previous session closing balance as opening balance
        if opening_balance == 0.0:
            previous = db.accounting_sessions.find_one(
                {
                    "user_id": user_id,
                    "school_id": school_id,
                    "status": "CLOSED"
                },
                sort=[("closed_at", -1)]
            )
            if previous and previous.get("closing_balance") is not None:
                # Calculate: previous closing - what was submitted to admin
                opening_balance = previous.get("closing_balance", 0.0)
                logger.info(f"📂 Using previous session closing balance: {opening_balance}")
        
        # Create new session
        session = {
            "school_id": school_id,
            "user_id": user_id,
            "user_name": user_name,
            "role": role,
            "session_date": today,
            "opening_balance": opening_balance,
            "closing_balance": None,
            "total_collected": 0.0,
            "total_submitted_to_admin": 0.0,
            "transaction_count": 0,
            "status": "OPEN",
            "opened_at": now,
            "closed_at": None,
            "notes": notes
        }
        
        result = db.accounting_sessions.insert_one(session)
        session["id"] = str(result.inserted_id)
        session.pop("_id", None)
        
        # Convert datetime to string for JSON serialization
        session["opened_at"] = session["opened_at"].isoformat()
        
        logger.info(f"📂 Accounting session opened: {session['id']}")
        return session
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error opening accounting session: {e}")
        logger.error(traceback.format_exc())
        raise


def get_active_accounting_session(
    user_id: str,
    school_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get the currently active (OPEN) accounting session for today.
    """
    logger.info(f"📂 Getting active accounting session for user {user_id}")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        
        session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": "OPEN"
        })
        
        if session:
            session["id"] = str(session.pop("_id"))
            # Calculate outstanding balance
            session["outstanding_balance"] = session.get("total_collected", 0.0) - session.get("total_submitted_to_admin", 0.0)
            # Convert datetime fields
            if session.get("opened_at"):
                session["opened_at"] = session["opened_at"].isoformat() if hasattr(session["opened_at"], 'isoformat') else session["opened_at"]
            if session.get("closed_at"):
                session["closed_at"] = session["closed_at"].isoformat() if hasattr(session["closed_at"], 'isoformat') else session["closed_at"]
            logger.info(f"📂 Found active session: {session['id']}")
        else:
            logger.info(f"📂 No active session found for user {user_id}")
        
        return session
        
    except Exception as e:
        logger.error(f"❌ Error getting active session: {e}")
        raise


def get_accounting_session_by_id(session_id: str) -> Optional[Dict[str, Any]]:
    """Get accounting session by ID"""
    logger.info(f"📂 Getting accounting session: {session_id}")
    
    try:
        db = get_db()
        session = db.accounting_sessions.find_one({"_id": ObjectId(session_id)})
        
        if session:
            session["id"] = str(session.pop("_id"))
            session["outstanding_balance"] = session.get("total_collected", 0.0) - session.get("total_submitted_to_admin", 0.0)
            # Convert datetime fields
            if session.get("opened_at"):
                session["opened_at"] = session["opened_at"].isoformat() if hasattr(session["opened_at"], 'isoformat') else session["opened_at"]
            if session.get("closed_at"):
                session["closed_at"] = session["closed_at"].isoformat() if hasattr(session["closed_at"], 'isoformat') else session["closed_at"]
        
        return session
        
    except Exception as e:
        logger.error(f"❌ Error getting session {session_id}: {e}")
        raise


def update_session_stats(
    session_id: str,
    amount_collected: float = 0.0,
    increment_transactions: bool = True
) -> Dict[str, Any]:
    """
    Update session statistics when a payment is recorded.
    Called automatically after student payments.
    """
    logger.info(f"📊 Updating session stats for {session_id}, amount: {amount_collected}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        update_ops = {
            "$inc": {
                "total_collected": amount_collected
            },
            "$set": {
                "updated_at": now
            }
        }
        
        if increment_transactions:
            update_ops["$inc"]["transaction_count"] = 1
        
        db.accounting_sessions.update_one(
            {"_id": ObjectId(session_id)},
            update_ops
        )
        
        session = get_accounting_session_by_id(session_id)
        logger.info(f"📊 Session stats updated for session {session_id}")
        return session
        
    except Exception as e:
        logger.error(f"❌ Error updating session stats: {e}")
        raise


def close_accounting_session(
    session_id: str,
    closing_balance: Optional[float] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Close the accounting session at end of day.
    Calculates totals, verifies outstanding balance, and locks session.
    """
    logger.info(f"🔒 Closing accounting session: {session_id}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        session = db.accounting_sessions.find_one({"_id": ObjectId(session_id)})
        
        if not session:
            raise ValueError("Session not found")
        
        if session.get("status") == "CLOSED":
            raise ValueError("Session is already closed")
        
        # Calculate closing balance if not provided
        total_collected = session.get("total_collected", 0.0)
        total_submitted = session.get("total_submitted_to_admin", 0.0)
        opening = session.get("opening_balance", 0.0)
        
        if closing_balance is None:
            # closing_balance = opening + collected - paid_to_admin
            closing_balance = opening + total_collected - total_submitted
        
        outstanding = total_collected - total_submitted
        
        # Update session
        update_data = {
            "status": "CLOSED",
            "closing_balance": closing_balance,
            "closed_at": now,
            "updated_at": now
        }
        
        if notes:
            update_data["notes"] = notes
        
        db.accounting_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": update_data}
        )
        
        result = get_accounting_session_by_id(session_id)
        logger.info(f"🔒 Session closed successfully: {session_id}, closing_balance: {closing_balance}")
        
        return result
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error closing session: {e}")
        raise


def is_session_open(session_id: str) -> bool:
    """Check if a session is currently open"""
    try:
        db = get_db()
        session = db.accounting_sessions.find_one({"_id": ObjectId(session_id)})
        return session and session.get("status") == "OPEN"
    except Exception as e:
        logger.error(f"❌ Error checking session status: {e}")
        return False


# ==================== LEDGER MANAGEMENT ====================

def create_ledger_entry(
    school_id: str,
    session_id: str,
    user_id: str,
    transaction_type: str,
    reference_id: str,
    debit: float = 0.0,
    credit: float = 0.0,
    description: str = ""
) -> Dict[str, Any]:
    """
    Create a ledger entry for any financial transaction.
    Student payment → credit
    Admin cash submission → debit
    """
    logger.info(f"📒 Creating ledger entry: type={transaction_type}, debit={debit}, credit={credit}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        # Get current balance from last ledger entry
        last_entry = db.accountant_ledger.find_one(
            {"school_id": school_id, "user_id": user_id},
            sort=[("created_at", -1)]
        )
        
        previous_balance = last_entry.get("balance_after", 0.0) if last_entry else 0.0
        balance_after = previous_balance + credit - debit
        
        entry = {
            "school_id": school_id,
            "session_id": session_id,
            "user_id": user_id,
            "transaction_type": transaction_type,
            "reference_id": reference_id,
            "debit": debit,
            "credit": credit,
            "balance_after": balance_after,
            "description": description,
            "created_at": now
        }
        
        result = db.accountant_ledger.insert_one(entry)
        entry["id"] = str(result.inserted_id)
        entry.pop("_id", None)
        entry["created_at"] = entry["created_at"].isoformat()
        
        logger.info(f"📒 Ledger entry created: {entry['id']}, balance_after: {balance_after}")
        return entry
        
    except Exception as e:
        logger.error(f"❌ Error creating ledger entry: {e}")
        raise


def get_ledger_entries(
    school_id: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """Get ledger entries with filtering"""
    logger.info(f"📒 Getting ledger entries for school {school_id}")
    
    try:
        db = get_db()
        query = {"school_id": school_id}
        
        if user_id:
            query["user_id"] = user_id
        if session_id:
            query["session_id"] = session_id
        if transaction_type:
            query["transaction_type"] = transaction_type
        if start_date:
            query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
        if end_date:
            if "created_at" not in query:
                query["created_at"] = {}
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
        
        total = db.accountant_ledger.count_documents(query)
        entries = list(
            db.accountant_ledger.find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        
        for entry in entries:
            entry["id"] = str(entry.pop("_id"))
            if entry.get("created_at"):
                entry["created_at"] = entry["created_at"].isoformat() if hasattr(entry["created_at"], 'isoformat') else entry["created_at"]
        
        # Calculate totals
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total_debits": {"$sum": "$debit"},
                "total_credits": {"$sum": "$credit"}
            }}
        ]
        
        agg_result = list(db.accountant_ledger.aggregate(pipeline))
        total_debits = agg_result[0]["total_debits"] if agg_result else 0.0
        total_credits = agg_result[0]["total_credits"] if agg_result else 0.0
        
        # Get current balance from latest entry
        latest = entries[0] if entries else None
        current_balance = latest.get("balance_after", 0.0) if latest else 0.0
        
        logger.info(f"📒 Found {len(entries)} ledger entries")
        
        return {
            "entries": entries,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_debits": total_debits,
            "total_credits": total_credits,
            "current_balance": current_balance
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting ledger entries: {e}")
        raise


# ==================== ADMIN CASH SUBMISSIONS ====================

def create_principal_payment(
    school_id: str,
    session_id: str,
    accountant_id: str,
    accountant_name: str,
    amount: float,
    payment_method: str = "CASH",
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create an admin cash submission request.
    This is a request to transfer collected cash to the admin.
    """
    logger.info(f"💸 Creating admin cash submission request: amount={amount}, method={payment_method}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        # Verify session is open
        session = db.accounting_sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise ValueError("Session not found")
        if session.get("status") != "OPEN":
            raise ValueError("Session is closed. Cannot create admin cash submission.")
        
        # Verify amount doesn't exceed outstanding balance
        outstanding = session.get("total_collected", 0.0) - session.get("total_submitted_to_admin", 0.0)
        if amount > outstanding:
            raise ValueError(f"Amount ({amount}) exceeds outstanding balance ({outstanding})")
        
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        
        payment = {
            "school_id": school_id,
            "session_id": session_id,
            "accountant_id": accountant_id,
            "accountant_name": accountant_name,
            "amount": amount,
            "payment_method": payment_method,
            "status": "PENDING",
            "created_at": now,
            "approved_at": None,
            "approved_by": None,
            "approved_by_name": None,
            "rejection_reason": None,
            "notes": notes
        }
        
        result = db.principal_payments.insert_one(payment)
        payment["id"] = str(result.inserted_id)
        payment.pop("_id", None)
        payment["created_at"] = payment["created_at"].isoformat()
        
        logger.info(f"💸 Admin cash submission request created: {payment['id']}")
        return payment
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating admin cash submission: {e}")
        raise


def approve_principal_payment(
    payment_id: str,
    approved_by: str,
    approved_by_name: str,
    school_id: str
) -> Dict[str, Any]:
    """
    Admin approves a cash submission.
    Updates session stats and creates ledger entry.
    """
    logger.info(f"✅ Approving admin cash submission: {payment_id}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        payment = db.principal_payments.find_one({
            "_id": ObjectId(payment_id),
            "school_id": school_id
        })
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.get("status") != "PENDING":
            raise ValueError(f"Payment is already {payment.get('status')}")
        
        # Update payment status
        db.principal_payments.update_one(
            {"_id": ObjectId(payment_id)},
            {
                "$set": {
                    "status": "APPROVED",
                    "approved_at": now,
                    "approved_by": approved_by,
                    "approved_by_name": approved_by_name
                }
            }
        )
        
        # Update session stats
        session_id = payment.get("session_id")
        db.accounting_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$inc": {
                    "total_submitted_to_admin": payment["amount"]
                },
                "$set": {
                    "updated_at": now
                }
            }
        )
        
        # Create ledger entry (debit - money going out)
        create_ledger_entry(
            school_id=school_id,
            session_id=session_id,
            user_id=payment["accountant_id"],
            transaction_type="PAY_TO_PRINCIPAL",
            reference_id=payment_id,
            debit=payment["amount"],
            credit=0.0,
            description=f"Admin cash submission approved - {payment['payment_method']}"
        )
        
        # Return updated payment
        payment = db.principal_payments.find_one({"_id": ObjectId(payment_id)})
        payment["id"] = str(payment.pop("_id"))
        if payment.get("created_at"):
            payment["created_at"] = payment["created_at"].isoformat() if hasattr(payment["created_at"], 'isoformat') else payment["created_at"]
        if payment.get("approved_at"):
            payment["approved_at"] = payment["approved_at"].isoformat() if hasattr(payment["approved_at"], 'isoformat') else payment["approved_at"]
        
        logger.info(f"✅ Admin cash submission approved: {payment_id}")
        return payment
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error approving admin cash submission: {e}")
        raise


def reject_principal_payment(
    payment_id: str,
    rejected_by: str,
    rejection_reason: str,
    school_id: str
) -> Dict[str, Any]:
    """
    Admin rejects a cash submission.
    """
    logger.info(f"❌ Rejecting admin cash submission: {payment_id}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        payment = db.principal_payments.find_one({
            "_id": ObjectId(payment_id),
            "school_id": school_id
        })
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.get("status") != "PENDING":
            raise ValueError(f"Payment is already {payment.get('status')}")
        
        # Update payment status
        db.principal_payments.update_one(
            {"_id": ObjectId(payment_id)},
            {
                "$set": {
                    "status": "REJECTED",
                    "approved_at": now,  # Using same field for rejection time
                    "approved_by": rejected_by,
                    "rejection_reason": rejection_reason
                }
            }
        )
        
        # Return updated payment
        payment = db.principal_payments.find_one({"_id": ObjectId(payment_id)})
        payment["id"] = str(payment.pop("_id"))
        if payment.get("created_at"):
            payment["created_at"] = payment["created_at"].isoformat() if hasattr(payment["created_at"], 'isoformat') else payment["created_at"]
        if payment.get("approved_at"):
            payment["approved_at"] = payment["approved_at"].isoformat() if hasattr(payment["approved_at"], 'isoformat') else payment["approved_at"]
        
        logger.info(f"❌ Admin cash submission rejected: {payment_id}")
        return payment
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error rejecting admin cash submission: {e}")
        raise


def get_principal_payments(
    school_id: str,
    session_id: Optional[str] = None,
    accountant_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """Get admin cash submissions with filtering"""
    logger.info(f"💸 Getting admin cash submissions for school {school_id}")
    
    try:
        db = get_db()
        query = {"school_id": school_id}
        
        if session_id:
            query["session_id"] = session_id
        if accountant_id:
            query["accountant_id"] = accountant_id
        if status:
            query["status"] = status
        
        total = db.principal_payments.count_documents(query)
        payments = list(
            db.principal_payments.find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        
        for payment in payments:
            payment["id"] = str(payment.pop("_id"))
            if payment.get("created_at"):
                payment["created_at"] = payment["created_at"].isoformat() if hasattr(payment["created_at"], 'isoformat') else payment["created_at"]
            if payment.get("approved_at"):
                payment["approved_at"] = payment["approved_at"].isoformat() if hasattr(payment["approved_at"], 'isoformat') else payment["approved_at"]
        
        logger.info(f"💸 Found {len(payments)} admin cash submissions")
        
        return {
            "items": payments,
            "total": total,
            "page": page,
            "page_size": page_size
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting admin cash submissions: {e}")
        raise


# ==================== ACCOUNTANT BALANCE ====================

def get_accountant_balance(
    user_id: str,
    school_id: str
) -> Dict[str, Any]:
    """
    Get accountant's current balance.
    outstanding_balance = total_collected - total_paid_to_admin
    """
    logger.info(f"💰 Calculating accountant balance for user {user_id}")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        
        # Get today's session
        session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today
        })
        
        if not session:
            logger.info(f"💰 No session found for today")
            return {
                "collected_today": 0.0,
                "paid_to_admin": 0.0,
                "outstanding_balance": 0.0,
                "session_id": None,
                "session_status": None
            }
        
        collected = session.get("total_collected", 0.0)
        paid = session.get("total_submitted_to_admin", 0.0)
        outstanding = collected - paid
        
        result = {
            "collected_today": collected,
            "paid_to_admin": paid,
            "outstanding_balance": outstanding,
            "session_id": str(session["_id"]),
            "session_status": session.get("status")
        }
        
        logger.info(f"💰 Accountant balance calculated: collected={collected}, paid={paid}, outstanding={outstanding}")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error calculating accountant balance: {e}")
        raise


# ==================== SESSION HISTORY ====================

def get_accounting_sessions(
    school_id: str,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """Get accounting sessions with filtering"""
    logger.info(f"📂 Getting accounting sessions for school {school_id}")
    
    try:
        db = get_db()
        query = {"school_id": school_id}
        
        if user_id:
            query["user_id"] = user_id
        if status:
            query["status"] = status
        if start_date:
            query["session_date"] = {"$gte": start_date}
        if end_date:
            if "session_date" not in query:
                query["session_date"] = {}
            query["session_date"]["$lte"] = end_date
        
        total = db.accounting_sessions.count_documents(query)
        sessions = list(
            db.accounting_sessions.find(query)
            .sort("session_date", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        
        for session in sessions:
            session["id"] = str(session.pop("_id"))
            session["outstanding_balance"] = session.get("total_collected", 0.0) - session.get("total_paid_to_admin", 0.0)
            if session.get("opened_at"):
                session["opened_at"] = session["opened_at"].isoformat() if hasattr(session["opened_at"], 'isoformat') else session["opened_at"]
            if session.get("closed_at"):
                session["closed_at"] = session["closed_at"].isoformat() if hasattr(session["closed_at"], 'isoformat') else session["closed_at"]
        
        logger.info(f"📂 Found {len(sessions)} accounting sessions")
        
        return {
            "items": sessions,
            "total": total,
            "page": page,
            "page_size": page_size
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting accounting sessions: {e}")
        raise


# ==================== HELPER FUNCTIONS ====================

def record_student_payment_to_ledger(
    school_id: str,
    session_id: str,
    user_id: str,
    payment_id: str,
    amount: float,
    student_name: str = "Student"
) -> Dict[str, Any]:
    """
    Record a student payment in the ledger and update session stats.
    Called automatically when a student payment is recorded.
    """
    logger.info(f"📒 Recording student payment to ledger: {payment_id}, amount: {amount}")
    
    try:
        # Update session stats
        update_session_stats(session_id, amount_collected=amount, increment_transactions=True)
        
        # Create ledger entry (credit - money coming in)
        entry = create_ledger_entry(
            school_id=school_id,
            session_id=session_id,
            user_id=user_id,
            transaction_type="STUDENT_PAYMENT",
            reference_id=payment_id,
            debit=0.0,
            credit=amount,
            description=f"Student fee payment from {student_name}"
        )
        
        logger.info(f"📒 Student payment recorded to ledger: {entry['id']}")
        return entry
        
    except Exception as e:
        logger.error(f"❌ Error recording student payment to ledger: {e}")
        raise
