"""
Daily Workflow Service for MODULE 4
Session Closing, Verification, Admin Cash Submissions, and Audit Trail
"""
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any
from app.database import get_db
from app.services.saas_db import get_global_user_by_email
from bson import ObjectId
import logging
import traceback
import bcrypt
import hashlib

logger = logging.getLogger(__name__)


# ==================== PASSWORD VERIFICATION ====================

def verify_user_password(email: str, password: str) -> bool:
    """
    Verify user's password against global_users collection.
    Returns True if password matches.
    """
    logger.info(f"🔐 Verifying password for user {email}")
    
    try:
        from app.services.saas_db import get_saas_root_db
        
        saas_db = get_saas_root_db()
        user = saas_db.global_users.find_one({"email": email})
        
        if not user:
            logger.warning(f"🔐 User not found: {email}")
            return False
        
        stored_hash = user.get("hashed_password") or user.get("password_hash") or user.get("password")

        if not stored_hash:
            logger.error(f"🔐 No password hash found for user: {email}")
            return False

        # Determine hash type and verify accordingly
        try:
            # bcrypt hashes start with $2a$/$2b$/$2y$
            if isinstance(stored_hash, (bytes, bytearray)):
                raw = bytes(stored_hash)
            else:
                raw = str(stored_hash)

            if isinstance(raw, (bytes, bytearray)) and raw.startswith(b"$2"):
                is_valid = bcrypt.checkpw(password.encode('utf-8'), raw)
            elif isinstance(raw, str) and raw.startswith("$2"):
                is_valid = bcrypt.checkpw(password.encode('utf-8'), raw.encode('utf-8'))
            else:
                # Fallback: legacy SHA256 hex digest comparison
                pw_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
                is_valid = (pw_hash == str(raw))

            if is_valid:
                logger.info(f"🔐 Password verified successfully for {email}")
            else:
                logger.warning(f"🔐 Invalid password for {email}")

            return is_valid

        except ValueError as ve:
            logger.error(f"🔐 Error verifying password: {ve}")
            logger.error(traceback.format_exc())
            return False
        
    except Exception as e:
        logger.error(f"🔐 Error verifying password: {e}")
        logger.error(traceback.format_exc())
        return False


# ==================== DAILY SUMMARY ====================

def get_daily_summary(
    user_id: str,
    school_id: str,
    target_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get comprehensive daily summary for an accountant.
    Includes all payments, balances, and admin cash submissions for the day.
    """
    logger.info(f"📊 Getting daily summary for user {user_id}")
    
    try:
        db = get_db()
        today = target_date or date.today().isoformat()
        
        # Get user info
        from app.services.saas_db import get_saas_root_db
        saas_db = get_saas_root_db()
        user = saas_db.global_users.find_one({"id": user_id}) or saas_db.global_users.find_one({"_id": ObjectId(user_id)})
        user_name = user.get("name", "Unknown") if user else "Unknown"
        user_email = user.get("email", "") if user else ""
        
        # Get today's session
        session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today
        })
        
        session_status = session.get("status", "NO_SESSION") if session else "NO_SESSION"
        session_id = str(session["_id"]) if session else None
        
        opening_balance = session.get("opening_balance", 0.0) if session else 0.0
        total_collected = session.get("total_collected", 0.0) if session else 0.0
        total_paid = session.get("total_paid_to_admin", 0.0) if session else 0.0
        current_balance = opening_balance + total_collected - total_paid
        
        # Get today's payments from student_payments
        start_of_day = datetime.fromisoformat(today)
        end_of_day = start_of_day + timedelta(days=1)
        
        payments_query = {
            "school_id": school_id,
            "accountant_id": user_id,
            "created_at": {"$gte": start_of_day, "$lt": end_of_day}
        }
        
        payments = list(db.student_payments.find(payments_query).sort("created_at", -1))
        
        # Process payments
        payment_list = []
        collection_by_method = {}
        collection_by_class = {}
        
        for p in payments:
            snapshot = p.get("student_snapshot", {})
            payment_method = p.get("payment_method", {})
            method_name = payment_method.get("name", "Unknown") if isinstance(payment_method, dict) else str(payment_method)
            amount = p.get("amount", 0.0)
            class_name = snapshot.get("class_name", "Unknown")
            
            payment_list.append({
                "payment_id": str(p["_id"]),
                "student_id": p.get("student_id", ""),
                "student_name": snapshot.get("name", "Unknown"),
                "student_class": class_name,
                "amount": amount,
                "payment_method": method_name,
                "timestamp": p.get("created_at").isoformat() if p.get("created_at") else "",
                "fee_type": p.get("fee_month", "")
            })
            
            # Collection by method
            collection_by_method[method_name] = collection_by_method.get(method_name, 0.0) + amount
            
            # Collection by class
            collection_by_class[class_name] = collection_by_class.get(class_name, 0.0) + amount
        
        # Get today's principal payments
        principal_payments = list(db.principal_payments.find({
            "school_id": school_id,
            "accountant_id": user_id,
            "created_at": {"$gte": start_of_day, "$lt": end_of_day}
        }))
        
        principal_payment_list = []
        for pp in principal_payments:
            principal_payment_list.append({
                "id": str(pp["_id"]),
                "amount": pp.get("amount", 0.0),
                "payment_method": pp.get("payment_method", "CASH"),
                "status": pp.get("status", "PENDING"),
                "created_at": pp.get("created_at").isoformat() if pp.get("created_at") else "",
                "approved_at": pp.get("approved_at").isoformat() if pp.get("approved_at") else None
            })
        
        outstanding = total_collected - total_paid
        
        result = {
            "date": today,
            "accountant_id": user_id,
            "accountant_name": user_name,
            "accountant_email": user_email,
            
            "session_status": session_status,
            "session_id": session_id,
            
            "opening_balance": opening_balance,
            "current_balance": current_balance,
            
            "total_collected_today": total_collected,
            "total_paid_to_principal_today": total_paid,
            "outstanding_balance": outstanding,
            
            "collection_by_method": collection_by_method,
            "collection_by_class": collection_by_class,
            
            "payment_count": len(payment_list),
            "payments": payment_list,
            
            "principal_payments_today": principal_payment_list
        }
        
        logger.info(f"📊 Daily summary: collected={total_collected}, outstanding={outstanding}, payments={len(payment_list)}")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting daily summary: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== SESSION CLOSE WITH VERIFICATION ====================

def close_session_with_verification(
    user_id: str,
    user_email: str,
    school_id: str,
    password: str,
    closing_balance: float,
    closing_balance_by_method: Dict[str, float],
    discrepancy_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Close the current session with password verification.
    Creates audit trail and updates all balances.
    """
    logger.info(f"🔒 Closing session with verification for user {user_email}")
    
    # Verify password first
    if not verify_user_password(user_email, password):
        logger.warning(f"🔒 Password verification failed for {user_email}")
        raise ValueError("Invalid password. Session close denied.")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        now = datetime.utcnow()
        
        # Get user info
        from app.services.saas_db import get_saas_root_db
        saas_db = get_saas_root_db()
        user = saas_db.global_users.find_one({"email": user_email})
        user_name = user.get("name", "Unknown") if user else "Unknown"
        
        # Get current session
        session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": "OPEN"
        })

        # If no accounting_sessions entry exists, try to find an active cash_sessions
        if not session:
            logger.info(f"🔒 No accounting_sessions.OPEN found for user {user_email}, checking cash_sessions fallback")
            cash_session = db.cash_sessions.find_one({
                "user_id": user_id,
                "school_id": school_id,
                "session_date": today,
                "status": {"$ne": "closed"}
            })

            if not cash_session:
                raise ValueError("No active session found for today")

            # Use cash_session close helper to close the cash session
            try:
                from app.services.cash_session_service import close_session as close_cash_session

                closed_cash = close_cash_session(str(cash_session.get("_id") or cash_session.get("id")), closing_balance_by_method, discrepancy_notes, user_email)

                # Log audit entry for fallback close
                audit_entry = {
                    "school_id": school_id,
                    "action_type": "SESSION_CLOSE",
                    "action_description": f"Cash session closed by {user_name} (fallback accounting) - via daily-workflow",
                    "performed_by_id": user_id,
                    "performed_by_name": user_name,
                    "performed_by_email": user_email,
                    "performed_by_role": "Accountant",
                    "target_type": "cash_session",
                    "target_id": str(closed_cash.get("id") or closed_cash.get("_id")),
                    "metadata": {
                        "closing_balance": closed_cash.get("closing_balance"),
                        "discrepancy": closed_cash.get("discrepancy"),
                        "payment_count": closed_cash.get("transaction_count") or 0
                    },
                    "timestamp": now
                }

                db.daily_audit_log.insert_one(audit_entry)

                # Create a ledger entry summarizing the close (minimal)
                try:
                    ledger_entry = {
                        "school_id": school_id,
                        "session_id": str(closed_cash.get("id") or closed_cash.get("_id")),
                        "user_id": user_id,
                        "transaction_type": "SESSION_CLOSE",
                        "reference_id": str(closed_cash.get("id") or closed_cash.get("_id")),
                        "debit": 0.0,
                        "credit": 0.0,
                        "balance_after": closed_cash.get("closing_balance", 0.0),
                        "description": "Cash session closed via daily-workflow fallback",
                        "metadata": {
                            "closing_balance_by_method": closed_cash.get("closing_balance_by_method", {}),
                            "discrepancy": closed_cash.get("discrepancy", 0.0)
                        },
                        "created_at": now
                    }
                    db.accountant_ledger.insert_one(ledger_entry)
                except Exception:
                    logger.exception("Failed to insert ledger entry for cash session fallback close")

                # Build a response compatible with ClosedSessionSummary
                result = {
                    "session_id": str(closed_cash.get("id") or closed_cash.get("_id")),
                    "session_date": today,
                    "accountant_id": user_id,
                    "accountant_name": user_name,

                    "opening_balance": closed_cash.get("opening_balance", 0.0),
                    "closing_balance": closed_cash.get("closing_balance", 0.0),

                    "total_collected": closed_cash.get("current_balance", 0.0) - closed_cash.get("opening_balance", 0.0),
                    "total_paid_to_principal": 0.0,
                    "outstanding_balance": closed_cash.get("discrepancy", 0.0),

                    "collection_by_method": closed_cash.get("closing_balance_by_method", {}),
                    "payment_count": closed_cash.get("transaction_count") or 0,
                    "payments": [],

                    "discrepancy": closed_cash.get("discrepancy", 0.0),
                    "discrepancy_notes": closed_cash.get("discrepancy_notes"),
                    "close_status": "SUCCESS" if abs(closed_cash.get("discrepancy", 0.0)) < 0.01 else "DISCREPANCY",

                    "closed_at": closed_cash.get("closed_at") if isinstance(closed_cash.get("closed_at"), str) else (closed_cash.get("closed_at").isoformat() if closed_cash.get("closed_at") else now.isoformat()),
                    "verified_by": user_email
                }

                logger.info(f"🔒 Cash session fallback closed successfully: {result['session_id']}")
                return result
            except Exception as e:
                logger.error(f"🔒 Error closing cash_session fallback: {e}")
                logger.error(traceback.format_exc())
                raise
        
        session_id = str(session["_id"])
        opening_balance = session.get("opening_balance", 0.0)
        total_collected = session.get("total_collected", 0.0)
        total_paid = session.get("total_paid_to_principal", 0.0)
        
        # Calculate expected closing balance
        expected_closing = opening_balance + total_collected - total_paid
        discrepancy = closing_balance - expected_closing
        
        # Determine close status
        close_status = "SUCCESS" if abs(discrepancy) < 0.01 else "DISCREPANCY"
        
        # Get all payments for the session
        start_of_day = datetime.fromisoformat(today)
        end_of_day = start_of_day + timedelta(days=1)
        
        payments = list(db.student_payments.find({
            "school_id": school_id,
            "accountant_id": user_id,
            "created_at": {"$gte": start_of_day, "$lt": end_of_day}
        }).sort("created_at", -1))
        
        # Build payment snapshots
        payment_snapshots = []
        collection_by_method = {}
        
        for p in payments:
            snapshot = p.get("student_snapshot", {})
            payment_method = p.get("payment_method", {})
            method_name = payment_method.get("name", "Unknown") if isinstance(payment_method, dict) else str(payment_method)
            amount = p.get("amount", 0.0)
            
            payment_snapshots.append({
                "payment_id": str(p["_id"]),
                "student_id": p.get("student_id", ""),
                "student_name": snapshot.get("name", "Unknown"),
                "student_class": snapshot.get("class_name", "Unknown"),
                "amount": amount,
                "payment_method": method_name,
                "payment_method_id": payment_method.get("id") if isinstance(payment_method, dict) else None,
                "timestamp": p.get("created_at").isoformat() if p.get("created_at") else "",
                "collector_id": user_id,
                "collector_name": user_name
            })
            
            collection_by_method[method_name] = collection_by_method.get(method_name, 0.0) + amount
        
        # Update session
        update_data = {
            "status": "CLOSED",
            "closing_balance": closing_balance,
            "closing_balance_by_method": closing_balance_by_method,
            "discrepancy": discrepancy,
            "discrepancy_notes": discrepancy_notes,
            "close_status": close_status,
            "closed_at": now,
            "updated_at": now,
            "verified_by": user_email
        }
        
        db.accounting_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": update_data}
        )
        
        # Create ledger entry for session close
        ledger_entry = {
            "school_id": school_id,
            "session_id": session_id,
            "user_id": user_id,
            "transaction_type": "SESSION_CLOSE",
            "reference_id": session_id,
            "debit": 0.0,
            "credit": 0.0,
            "balance_after": closing_balance,
            "description": f"Session closed - {close_status}",
            "metadata": {
                "opening_balance": opening_balance,
                "total_collected": total_collected,
                "total_paid_to_principal": total_paid,
                "closing_balance": closing_balance,
                "discrepancy": discrepancy
            },
            "created_at": now
        }
        
        db.accountant_ledger.insert_one(ledger_entry)
        
        # Create audit entry
        audit_entry = {
            "school_id": school_id,
            "action_type": "SESSION_CLOSE",
            "action_description": f"Session closed by {user_name} - {close_status}",
            "performed_by_id": user_id,
            "performed_by_name": user_name,
            "performed_by_email": user_email,
            "performed_by_role": "Accountant",
            "target_type": "session",
            "target_id": session_id,
            "metadata": {
                "closing_balance": closing_balance,
                "discrepancy": discrepancy,
                "payment_count": len(payment_snapshots)
            },
            "timestamp": now
        }
        
        db.daily_audit_log.insert_one(audit_entry)
        
        outstanding = total_collected - total_paid
        
        result = {
            "session_id": session_id,
            "session_date": today,
            "accountant_id": user_id,
            "accountant_name": user_name,
            
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            
            "total_collected": total_collected,
            "total_paid_to_principal": total_paid,
            "outstanding_balance": outstanding,
            
            "collection_by_method": collection_by_method,
            
            "payment_count": len(payment_snapshots),
            "payments": payment_snapshots[:50],  # Limit to 50 most recent
            
            "discrepancy": discrepancy,
            "discrepancy_notes": discrepancy_notes,
            "close_status": close_status,
            
            "closed_at": now.isoformat(),
            "verified_by": user_email
        }
        
        logger.info(f"🔒 Session closed successfully: {session_id}, status: {close_status}, discrepancy: {discrepancy}")
        return result
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error closing session: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== PRINCIPAL PAYMENT WORKFLOW ====================

def create_principal_payment_with_verification(
    user_id: str,
    user_email: str,
    user_name: str,
    school_id: str,
    password: str,
    amount: float,
    payment_method: str = "CASH",
    notes: Optional[str] = None,
    proof_attachment: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a principal payment request with password verification.
    Validates session is closed and amount doesn't exceed outstanding.
    """
    logger.info(f"💸 Creating principal payment request for {user_email}: amount={amount}")
    
    # Verify password first
    if not verify_user_password(user_email, password):
        logger.warning(f"💸 Password verification failed for {user_email}")
        raise ValueError("Invalid password. Payment request denied.")
    
    try:
        db = get_db()
        today = date.today().isoformat()
        now = datetime.utcnow()
        
        # Check if there's an active (OPEN) session
        active_session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": "OPEN"
        })
        
        if active_session:
            logger.warning(f"💸 Cannot create principal payment - session still open")
            raise ValueError("Please close your session before making principal payment. (Session still open)")
        
        # Get this month's total collected amount
        start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "accountant_id": user_id,
                    "created_at": {"$gte": start_of_month}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        
        result = list(db.student_payments.aggregate(pipeline))
        total_collected_month = result[0]["total"] if result else 0.0
        
        # Get total paid to principal this month
        paid_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "accountant_id": user_id,
                    "status": "APPROVED",
                    "created_at": {"$gte": start_of_month}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        
        paid_result = list(db.principal_payments.aggregate(paid_pipeline))
        total_paid_month = paid_result[0]["total"] if paid_result else 0.0
        
        outstanding = total_collected_month - total_paid_month
        
        # Validate amount
        if amount > outstanding:
            logger.warning(f"💸 Amount {amount} exceeds outstanding {outstanding}")
            raise ValueError(f"Amount PKR {amount:,.0f} exceeds outstanding balance of PKR {outstanding:,.0f}")
        
        # Check for pending payments
        pending_payment = db.principal_payments.find_one({
            "school_id": school_id,
            "accountant_id": user_id,
            "status": "PENDING"
        })
        
        if pending_payment:
            logger.warning(f"💸 Pending payment exists for user {user_email}")
            raise ValueError("You have a pending principal payment awaiting approval. Please wait for admin action.")
        
        # Get closed session for today (optional reference)
        closed_session = db.accounting_sessions.find_one({
            "user_id": user_id,
            "school_id": school_id,
            "session_date": today,
            "status": "CLOSED"
        })
        
        session_id = str(closed_session["_id"]) if closed_session else None
        
        # Create principal payment record
        payment_record = {
            "school_id": school_id,
            "session_id": session_id,
            
            "accountant_id": user_id,
            "accountant_name": user_name,
            "accountant_email": user_email,
            
            "amount": amount,
            "payment_method": payment_method,
            "notes": notes,
            "proof_attachment": proof_attachment,
            
            "total_collected_month": total_collected_month,
            "outstanding_at_request": outstanding,
            
            "status": "PENDING",
            
            "created_at": now,
            "approved_at": None,
            "approved_by": None,
            "approved_by_name": None,
            "approved_by_email": None,
            "rejection_reason": None
        }
        
        result = db.principal_payments.insert_one(payment_record)
        payment_id = str(result.inserted_id)
        
        # Create audit entry
        audit_entry = {
            "school_id": school_id,
            "action_type": "PRINCIPAL_PAYMENT_REQUEST",
            "action_description": f"Principal payment request of PKR {amount:,.0f} by {user_name}",
            "performed_by_id": user_id,
            "performed_by_name": user_name,
            "performed_by_email": user_email,
            "performed_by_role": "Accountant",
            "target_type": "principal_payment",
            "target_id": payment_id,
            "metadata": {
                "amount": amount,
                "payment_method": payment_method,
                "outstanding_at_request": outstanding
            },
            "timestamp": now
        }
        
        db.daily_audit_log.insert_one(audit_entry)
        
        payment_record["id"] = payment_id
        payment_record.pop("_id", None)
        payment_record["created_at"] = now.isoformat()
        
        logger.info(f"💸 Principal payment request created: {payment_id}")
        return payment_record
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating principal payment: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== ADMIN APPROVAL WORKFLOW ====================

def get_pending_principal_payments(school_id: str) -> List[Dict[str, Any]]:
    """
    Get all pending principal payments for admin review.
    """
    logger.info(f"📋 Getting pending principal payments for school {school_id}")
    
    try:
        db = get_db()
        
        payments = list(db.principal_payments.find({
            "school_id": school_id,
            "status": "PENDING"
        }).sort("created_at", -1))
        
        result = []
        for p in payments:
            result.append({
                "id": str(p["_id"]),
                "accountant_id": p.get("accountant_id", ""),
                "accountant_name": p.get("accountant_name", "Unknown"),
                "accountant_email": p.get("accountant_email", ""),
                
                "amount": p.get("amount", 0.0),
                "payment_method": p.get("payment_method", "CASH"),
                "notes": p.get("notes"),
                
                "total_collected_month": p.get("total_collected_month", 0.0),
                "outstanding_at_request": p.get("outstanding_at_request", 0.0),
                
                "created_at": p.get("created_at").isoformat() if p.get("created_at") else "",
                "status": p.get("status", "PENDING")
            })
        
        logger.info(f"📋 Found {len(result)} pending principal payments")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting pending payments: {e}")
        logger.error(traceback.format_exc())
        raise


def approve_principal_payment_with_verification(
    payment_id: str,
    admin_id: str,
    admin_email: str,
    admin_name: str,
    school_id: str,
    password: str
) -> Dict[str, Any]:
    """
    Approve a principal payment with admin password verification.
    Updates ledger and accountant balance.
    """
    logger.info(f"✅ Approving principal payment {payment_id} by admin {admin_email}")
    
    # Verify admin password
    if not verify_user_password(admin_email, password):
        logger.warning(f"✅ Password verification failed for admin {admin_email}")
        raise ValueError("Invalid password. Approval denied.")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        # Get payment
        payment = db.principal_payments.find_one({
            "_id": ObjectId(payment_id),
            "school_id": school_id
        })
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.get("status") != "PENDING":
            raise ValueError(f"Payment is already {payment.get('status')}")
        
        # Update payment
        db.principal_payments.update_one(
            {"_id": ObjectId(payment_id)},
            {
                "$set": {
                    "status": "APPROVED",
                    "approved_at": now,
                    "approved_by": admin_id,
                    "approved_by_name": admin_name,
                    "approved_by_email": admin_email
                }
            }
        )
        
        # Update accountant's session stats (if session exists for today)
        accountant_id = payment.get("accountant_id")
        today = date.today().isoformat()
        
        db.accounting_sessions.update_one(
            {
                "user_id": accountant_id,
                "school_id": school_id,
                "session_date": today
            },
            {
                "$inc": {"total_paid_to_principal": payment.get("amount", 0.0)}
            }
        )
        
        # Create ledger entry
        amount = payment.get("amount", 0.0)
        
        # Get accountant's current balance
        last_ledger = db.accountant_ledger.find_one(
            {"school_id": school_id, "user_id": accountant_id},
            sort=[("created_at", -1)]
        )
        
        previous_balance = last_ledger.get("balance_after", 0.0) if last_ledger else 0.0
        new_balance = previous_balance - amount  # Debit (money leaving accountant)
        
        ledger_entry = {
            "school_id": school_id,
            "session_id": payment.get("session_id", ""),
            "user_id": accountant_id,
            "transaction_type": "PAY_TO_PRINCIPAL",
            "reference_id": payment_id,
            "debit": amount,
            "credit": 0.0,
            "balance_after": new_balance,
            "description": f"Principal payment approved by {admin_name}",
            "created_at": now
        }
        
        db.accountant_ledger.insert_one(ledger_entry)
        
        # Create audit entry
        audit_entry = {
            "school_id": school_id,
            "action_type": "PRINCIPAL_PAYMENT_APPROVED",
            "action_description": f"Principal payment of PKR {amount:,.0f} approved by {admin_name}",
            "performed_by_id": admin_id,
            "performed_by_name": admin_name,
            "performed_by_email": admin_email,
            "performed_by_role": "Admin",
            "target_type": "principal_payment",
            "target_id": payment_id,
            "metadata": {
                "amount": amount,
                "accountant_id": accountant_id,
                "accountant_name": payment.get("accountant_name", "Unknown")
            },
            "timestamp": now
        }
        
        db.daily_audit_log.insert_one(audit_entry)
        
        # Get updated payment
        updated = db.principal_payments.find_one({"_id": ObjectId(payment_id)})
        updated["id"] = str(updated.pop("_id"))
        for key in ["created_at", "approved_at"]:
            if updated.get(key) and hasattr(updated[key], 'isoformat'):
                updated[key] = updated[key].isoformat()
        
        logger.info(f"✅ Principal payment approved: {payment_id}, amount: {amount}")
        return updated
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error approving payment: {e}")
        logger.error(traceback.format_exc())
        raise


def reject_principal_payment_with_verification(
    payment_id: str,
    admin_id: str,
    admin_email: str,
    admin_name: str,
    school_id: str,
    password: str,
    rejection_reason: str
) -> Dict[str, Any]:
    """
    Reject a principal payment with admin password verification.
    """
    logger.info(f"❌ Rejecting principal payment {payment_id} by admin {admin_email}")
    
    # Verify admin password
    if not verify_user_password(admin_email, password):
        logger.warning(f"❌ Password verification failed for admin {admin_email}")
        raise ValueError("Invalid password. Rejection denied.")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        
        # Get payment
        payment = db.principal_payments.find_one({
            "_id": ObjectId(payment_id),
            "school_id": school_id
        })
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.get("status") != "PENDING":
            raise ValueError(f"Payment is already {payment.get('status')}")
        
        # Update payment
        db.principal_payments.update_one(
            {"_id": ObjectId(payment_id)},
            {
                "$set": {
                    "status": "REJECTED",
                    "approved_at": now,  # Using same field for rejection time
                    "approved_by": admin_id,
                    "approved_by_name": admin_name,
                    "approved_by_email": admin_email,
                    "rejection_reason": rejection_reason
                }
            }
        )
        
        # Create audit entry
        audit_entry = {
            "school_id": school_id,
            "action_type": "PRINCIPAL_PAYMENT_REJECTED",
            "action_description": f"Principal payment rejected by {admin_name}: {rejection_reason}",
            "performed_by_id": admin_id,
            "performed_by_name": admin_name,
            "performed_by_email": admin_email,
            "performed_by_role": "Admin",
            "target_type": "principal_payment",
            "target_id": payment_id,
            "metadata": {
                "amount": payment.get("amount", 0.0),
                "accountant_id": payment.get("accountant_id", ""),
                "rejection_reason": rejection_reason
            },
            "timestamp": now
        }
        
        db.daily_audit_log.insert_one(audit_entry)
        
        # Get updated payment
        updated = db.principal_payments.find_one({"_id": ObjectId(payment_id)})
        updated["id"] = str(updated.pop("_id"))
        for key in ["created_at", "approved_at"]:
            if updated.get(key) and hasattr(updated[key], 'isoformat'):
                updated[key] = updated[key].isoformat()
        
        logger.info(f"❌ Principal payment rejected: {payment_id}")
        return updated
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"❌ Error rejecting payment: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== ADMIN OVERVIEW ====================

def get_all_accountants_daily_overview(
    school_id: str,
    target_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get overview of all accountants' daily activity for admin dashboard.
    """
    logger.info(f"👥 Getting all accountants overview for school {school_id}")
    
    try:
        db = get_db()
        today = target_date or date.today().isoformat()
        
        from app.services.saas_db import get_saas_root_db
        saas_db = get_saas_root_db()
        
        # Get all accountants for this school
        accountants = list(saas_db.global_users.find({
            "school_id": school_id,
            "role": {"$regex": "accountant", "$options": "i"}
        }))
        
        accountant_list = []
        total_collected = 0.0
        total_paid = 0.0
        
        for acc in accountants:
            acc_id = acc.get("id") or str(acc.get("_id"))
            acc_name = acc.get("name", "Unknown")
            acc_email = acc.get("email", "")
            
            # Get session for this accountant
            session = db.accounting_sessions.find_one({
                "user_id": acc_id,
                "school_id": school_id,
                "session_date": today
            })
            
            session_status = session.get("status", "NO_SESSION") if session else "NO_SESSION"
            session_id = str(session["_id"]) if session else None
            
            opening = session.get("opening_balance", 0.0) if session else 0.0
            collected = session.get("total_collected", 0.0) if session else 0.0
            paid = session.get("total_paid_to_principal", 0.0) if session else 0.0
            closing = session.get("closing_balance") if session else None
            current = opening + collected - paid
            outstanding = collected - paid
            tx_count = session.get("transaction_count", 0) if session else 0
            
            # Check for pending principal payments
            pending = db.principal_payments.find_one({
                "school_id": school_id,
                "accountant_id": acc_id,
                "status": "PENDING"
            })
            
            accountant_list.append({
                "accountant_id": acc_id,
                "accountant_name": acc_name,
                "accountant_email": acc_email,
                
                "session_id": session_id,
                "session_status": session_status,
                
                "opening_balance": opening,
                "current_balance": current,
                "closing_balance": closing,
                
                "total_collected": collected,
                "total_paid_to_principal": paid,
                "outstanding_balance": outstanding,
                
                "payment_count": tx_count,
                
                "has_pending_principal_payment": pending is not None,
                "pending_payment_amount": pending.get("amount", 0.0) if pending else 0.0
            })
            
            total_collected += collected
            total_paid += paid
        
        result = {
            "date": today,
            "school_id": school_id,
            
            "total_collected_school": total_collected,
            "total_paid_to_principal_school": total_paid,
            "total_outstanding_school": total_collected - total_paid,
            
            "accountants": accountant_list
        }
        
        logger.info(f"👥 Found {len(accountant_list)} accountants, total collected: {total_collected}")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting accountants overview: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== MONTH COLLECTION DETAILS ====================

def get_month_collection_details(
    user_id: str,
    school_id: str
) -> Dict[str, Any]:
    """
    Get detailed collection breakdown for the current month.
    Used for Pay Principal modal to show what's being paid.
    """
    logger.info(f"📅 Getting month collection details for user {user_id}")
    
    try:
        db = get_db()
        now = datetime.utcnow()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Get all payments this month grouped by day
        pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "accountant_id": user_id,
                    "created_at": {"$gte": start_of_month}
                }
            },
            {
                "$addFields": {
                    "date_only": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}
                }
            },
            {
                "$group": {
                    "_id": "$date_only",
                    "total": {"$sum": "$amount"},
                    "count": {"$sum": 1},
                    "payments": {
                        "$push": {
                            "payment_id": {"$toString": "$_id"},
                            "student_name": "$student_snapshot.name",
                            "student_class": "$student_snapshot.class_name",
                            "amount": "$amount",
                            "payment_method": "$payment_method.name",
                            "timestamp": "$created_at"
                        }
                    }
                }
            },
            {"$sort": {"_id": -1}}
        ]
        
        daily_breakdown = list(db.student_payments.aggregate(pipeline))
        
        # Calculate totals
        total_collected = sum(d["total"] for d in daily_breakdown)
        total_count = sum(d["count"] for d in daily_breakdown)
        
        # Get approved principal payments this month
        approved_payments = list(db.principal_payments.find({
            "school_id": school_id,
            "accountant_id": user_id,
            "status": "APPROVED",
            "created_at": {"$gte": start_of_month}
        }))
        
        total_paid = sum(p.get("amount", 0.0) for p in approved_payments)
        outstanding = total_collected - total_paid
        
        result = {
            "month": start_of_month.strftime("%B %Y"),
            "accountant_id": user_id,
            
            "total_collected": total_collected,
            "total_paid_to_principal": total_paid,
            "outstanding_balance": outstanding,
            
            "payment_count": total_count,
            
            "daily_breakdown": [
                {
                    "date": d["_id"],
                    "total": d["total"],
                    "count": d["count"],
                    "payments": d["payments"][:20]  # Limit payments per day
                }
                for d in daily_breakdown
            ],
            
            "principal_payments": [
                {
                    "id": str(p["_id"]),
                    "amount": p.get("amount", 0.0),
                    "status": p.get("status"),
                    "created_at": p.get("created_at").isoformat() if p.get("created_at") else "",
                    "approved_at": p.get("approved_at").isoformat() if p.get("approved_at") else None
                }
                for p in approved_payments
            ]
        }
        
        logger.info(f"📅 Month summary: collected={total_collected}, paid={total_paid}, outstanding={outstanding}")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting month collection details: {e}")
        logger.error(traceback.format_exc())
        raise
