"""
Accounting Statistics Service - MODULE 5
Advanced Accounting Statistics & Visual Reports
Uses MongoDB aggregation pipelines for optimized queries
"""
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any, Tuple
from bson import ObjectId
import logging
import traceback
import math

from app.middleware.database_routing import get_db_for_request

logger = logging.getLogger(__name__)


# ==================== HELPERS ====================

def get_date_range(date_from: Optional[str], date_to: Optional[str]) -> Tuple[datetime, datetime]:
    """Get date range for queries, defaults to current month"""
    if date_from:
        start = datetime.fromisoformat(date_from)
    else:
        today = date.today()
        start = datetime(today.year, today.month, 1)
    
    if date_to:
        end = datetime.fromisoformat(date_to)
        end = end.replace(hour=23, minute=59, second=59)
    else:
        end = datetime.utcnow()
    
    return start, end


def get_today_range() -> Tuple[datetime, datetime]:
    """Get today's date range"""
    today = date.today()
    start = datetime(today.year, today.month, today.day, 0, 0, 0)
    end = datetime(today.year, today.month, today.day, 23, 59, 59)
    return start, end


def get_month_range() -> Tuple[datetime, datetime]:
    """Get current month's date range"""
    today = date.today()
    start = datetime(today.year, today.month, 1, 0, 0, 0)
    end = datetime.utcnow()
    return start, end


# ==================== ACCOUNTANT PERSONAL STATS (TASK 1) ====================

def get_accountant_personal_stats(
    user_id: str,
    user_name: str,
    user_email: str,
    school_id: str,
    days_trend: int = 30
) -> Dict[str, Any]:
    """
    Get personal statistics for an accountant.
    TASK 1: Accountant Personal Statistics Dashboard
    """
    logger.info(f"📊 Loading accountant statistics dashboard for {user_email}")
    
    try:
        db = get_db_for_request()
        today_start, today_end = get_today_range()
        month_start, month_end = get_month_range()
        
        # ===== TODAY'S COLLECTION =====
        logger.info("⚡ Optimized aggregation query executed - today's collection")
        today_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id,
                    "created_at": {"$gte": today_start, "$lte": today_end}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_amount": {"$sum": "$amount"},
                    "count": {"$sum": 1}
                }
            }
        ]
        today_result = list(db.student_payments.aggregate(today_pipeline))
        total_today = today_result[0]["total_amount"] if today_result else 0.0
        txn_today = today_result[0]["count"] if today_result else 0
        
        # ===== MONTH'S COLLECTION =====
        logger.info("⚡ Optimized aggregation query executed - month's collection")
        month_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id,
                    "created_at": {"$gte": month_start, "$lte": month_end}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_amount": {"$sum": "$amount"}
                }
            }
        ]
        month_result = list(db.student_payments.aggregate(month_pipeline))
        total_month = month_result[0]["total_amount"] if month_result else 0.0
        
        # ===== SESSIONS COUNT =====
        logger.info("⚡ Optimized aggregation query executed - sessions count")
        sessions_count = db.accounting_sessions.count_documents({
            "school_id": school_id,
            "user_id": user_id
        })
        
        # ===== CURRENT SESSION =====
        current_session = db.accounting_sessions.find_one(
            {"school_id": school_id, "user_id": user_id, "status": "OPEN"},
            {"_id": 1, "status": 1}
        )
        session_status = current_session["status"] if current_session else "CLOSED"
        session_id = str(current_session["_id"]) if current_session else None
        
        # ===== OUTSTANDING BALANCE =====
        # Sum of all collected minus admin cash submissions
        total_collected_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        total_coll = list(db.student_payments.aggregate(total_collected_pipeline))
        total_collected_all = total_coll[0]["total"] if total_coll else 0.0
        
        payouts_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "accountant_id": user_id,
                    "status": "APPROVED"
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        total_payouts = list(db.principal_payments.aggregate(payouts_pipeline))
        total_paid = total_payouts[0]["total"] if total_payouts else 0.0
        outstanding = total_collected_all - total_paid
        
        # ===== DAILY TREND (Last N days) =====
        logger.info("⚡ Optimized aggregation query executed - daily trend")
        trend_start = datetime.utcnow() - timedelta(days=days_trend)
        daily_trend_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id,
                    "created_at": {"$gte": trend_start}
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                    },
                    "amount": {"$sum": "$amount"},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        trend_data = list(db.student_payments.aggregate(daily_trend_pipeline))
        daily_trend = [
            {"date": item["_id"], "amount": item["amount"], "count": item["count"]}
            for item in trend_data
        ]
        
        # ===== PAYMENT METHOD DISTRIBUTION =====
        logger.info("⚡ Optimized aggregation query executed - payment methods")
        method_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id,
                    "created_at": {"$gte": month_start}
                }
            },
            {
                "$group": {
                    "_id": "$payment_method_name",
                    "total_transactions": {"$sum": 1},
                    "total_amount": {"$sum": "$amount"}
                }
            },
            {"$sort": {"total_amount": -1}}
        ]
        method_data = list(db.student_payments.aggregate(method_pipeline))
        total_method_amount = sum(m["total_amount"] for m in method_data) or 1
        payment_methods = [
            {
                "method_name": item["_id"] or "Unknown",
                "total_transactions": item["total_transactions"],
                "total_amount": item["total_amount"],
                "percentage": round((item["total_amount"] / total_method_amount) * 100, 2)
            }
            for item in method_data
        ]
        
        # ===== COLLECTION BY CLASS =====
        logger.info("⚡ Optimized aggregation query executed - collection by class")
        class_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "received_by": user_id,
                    "created_at": {"$gte": month_start}
                }
            },
            {
                "$group": {
                    "_id": "$student_snapshot.class_name",
                    "total_revenue": {"$sum": "$amount"},
                    "transaction_count": {"$sum": 1},
                    "students": {"$addToSet": "$student_id"}
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "total_revenue": 1,
                    "transaction_count": 1,
                    "student_count": {"$size": "$students"}
                }
            },
            {"$sort": {"total_revenue": -1}}
        ]
        class_data = list(db.student_payments.aggregate(class_pipeline))
        class_stats = [
            {
                "class_name": item["_id"] or "Unknown",
                "total_revenue": item["total_revenue"],
                "student_count": item["student_count"],
                "transaction_count": item["transaction_count"]
            }
            for item in class_data
        ]
        
        logger.info(f"📊 Accountant stats loaded: {total_today} today, {total_month} month")
        
        return {
            "accountant_id": user_id,
            "accountant_name": user_name,
            "accountant_email": user_email,
            "total_collected_today": total_today,
            "total_collected_month": total_month,
            "total_transactions_today": txn_today,
            "total_sessions_opened": sessions_count,
            "current_outstanding_balance": outstanding,
            "daily_collection_trend": daily_trend,
            "payment_method_distribution": payment_methods,
            "collection_by_class": class_stats,
            "current_session_status": session_status,
            "current_session_id": session_id
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting accountant stats: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== ADMIN GLOBAL STATS (TASK 2) ====================

def get_admin_global_stats(
    school_id: str,
    school_name: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    months_trend: int = 12
) -> Dict[str, Any]:
    """
    Get global statistics for admin dashboard.
    TASK 2: Admin Global Statistics Dashboard
    """
    logger.info(f"📊 Admin accounting statistics generated for school {school_id}")
    
    try:
        db = get_db_for_request()
        start, end = get_date_range(date_from, date_to)
        
        # ===== TOTAL SCHOOL REVENUE =====
        logger.info("⚡ Optimized aggregation query executed - school revenue")
        revenue_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "created_at": {"$gte": start, "$lte": end}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_revenue": {"$sum": "$amount"},
                    "total_transactions": {"$sum": 1}
                }
            }
        ]
        revenue_result = list(db.student_payments.aggregate(revenue_pipeline))
        total_revenue = revenue_result[0]["total_revenue"] if revenue_result else 0.0
        total_txns = revenue_result[0]["total_transactions"] if revenue_result else 0
        
        # ===== ADMIN CASH SUBMISSIONS =====
        logger.info("⚡ Optimized aggregation query executed - admin cash submissions")
        payout_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "status": "APPROVED",
                    "created_at": {"$gte": start, "$lte": end}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        payout_result = list(db.principal_payments.aggregate(payout_pipeline))
        total_payouts = payout_result[0]["total"] if payout_result else 0.0
        
        # ===== ACTIVE SESSIONS =====
        active_sessions = db.accounting_sessions.count_documents({
            "school_id": school_id,
            "status": "OPEN"
        })
        
        # ===== GET ALL ACCOUNTANTS WITH ACCOUNTANT ROLE (and admins if they record payments) =====
        logger.info("⚡ Fetching all accountants and admins for the school")
        all_accountants = list(db.users.find(
            {"role": {"$in": ["Accountant", "Admin"]}},  # Include both Accountants AND Admins
            {"_id": 1, "name": 1, "email": 1, "role": 1}
        ))
        
        # ===== REVENUE BY ACCOUNTANT (with all accountants included) =====
        logger.info("⚡ Optimized aggregation query executed - revenue by accountant")
        acct_revenue_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "created_at": {"$gte": start, "$lte": end}
                }
            },
            {
                "$group": {
                    "_id": "$received_by",
                    "received_by_name": {"$first": "$received_by_name"},
                    "total_collected": {"$sum": "$amount"},
                    "transaction_count": {"$sum": 1}
                }
            },
            {"$sort": {"total_collected": -1}}
        ]
        acct_revenue = list(db.student_payments.aggregate(acct_revenue_pipeline))
        
        # Create a map of accountant_id -> revenue data
        revenue_map = {}
        for acct in acct_revenue:
            if acct["_id"]:
                revenue_map[acct["_id"]] = {
                    "total_collected": acct["total_collected"],
                    "transaction_count": acct["transaction_count"],
                    "received_by_name": acct.get("received_by_name", "Unknown")
                }
        
        # Get accountant details - INCLUDE ALL ACCOUNTANTS
        accountants_data = []
        revenue_by_accountant = []
        
        for user in all_accountants:
            acct_id = str(user["_id"])
            user_name = user.get("name", "Unknown")
            user_email = user.get("email", "unknown")
            
            # Get revenue data if exists, otherwise zero
            revenue_data = revenue_map.get(acct_id, {
                "total_collected": 0,
                "transaction_count": 0,
                "received_by_name": user_name
            })
            
            total_collected = revenue_data["total_collected"]
            txn_count = revenue_data["transaction_count"]
            
            # Check if has active session
            has_active = db.accounting_sessions.count_documents({
                "school_id": school_id,
                "user_id": acct_id,
                "status": "OPEN"
            }) > 0
            
            # Sessions count
            sessions = db.accounting_sessions.count_documents({
                "school_id": school_id,
                "user_id": acct_id,
                "session_date": {"$gte": start.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")}
            })
            
            # Outstanding for this accountant
            acct_payouts_pipeline = [
                {
                    "$match": {
                        "school_id": school_id,
                        "accountant_id": acct_id,
                        "status": "APPROVED"
                    }
                },
                {
                    "$group": {"_id": None, "total": {"$sum": "$amount"}}
                }
            ]
            acct_payouts_res = list(db.principal_payments.aggregate(acct_payouts_pipeline))
            acct_paid = acct_payouts_res[0]["total"] if acct_payouts_res else 0.0
            acct_outstanding = total_collected - acct_paid
            
            # Add role designation to name for clarity
            role = user.get("role", "Accountant")
            display_name = f"{user_name} ({role})"
            
            accountants_data.append({
                "accountant_id": acct_id,
                "accountant_name": display_name,  # Shows "Name (Role)" e.g., "Ali (Admin)" or "Fatima (Accountant)"
                "accountant_email": user_email,
                "total_collected": total_collected,
                "transaction_count": txn_count,
                "sessions_opened": sessions,
                "outstanding_balance": max(0, acct_outstanding),
                "is_active_session": has_active
            })
            
            if total_collected > 0:  # Only add to chart if has collections
                role = user.get("role", "Accountant")
                revenue_by_accountant.append({
                    "name": f"{user_name} ({role})",
                    "value": total_collected
                })
        
        # ===== SESSIONS BY ACCOUNTANT =====
        sessions_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "session_date": {"$gte": start.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")}
                }
            },
            {
                "$group": {
                    "_id": "$user_id",
                    "count": {"$sum": 1}
                }
            }
        ]
        sessions_by_acct = list(db.accounting_sessions.aggregate(sessions_pipeline))
        sessions_by_accountant = []
        for ses in sessions_by_acct:
            user = db.users.find_one(
                {"_id": ObjectId(ses["_id"]) if ObjectId.is_valid(ses["_id"]) else None},
                {"name": 1}
            )
            name = user.get("name", "Unknown") if user else "Unknown"
            sessions_by_accountant.append({"name": name, "value": ses["count"]})
        
        # ===== MONTHLY REVENUE TREND =====
        logger.info("⚡ Optimized aggregation query executed - monthly trend")
        trend_start = datetime.utcnow() - timedelta(days=months_trend * 30)
        monthly_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "created_at": {"$gte": trend_start}
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m", "date": "$created_at"}
                    },
                    "amount": {"$sum": "$amount"},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        monthly_data = list(db.student_payments.aggregate(monthly_pipeline))
        monthly_trend = [
            {"date": item["_id"], "amount": item["amount"], "count": item["count"]}
            for item in monthly_data
        ]
        
        # ===== PAYMENT METHOD USAGE =====
        logger.info("⚡ Optimized aggregation query executed - payment method usage")
        method_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "created_at": {"$gte": start, "$lte": end}
                }
            },
            {
                "$group": {
                    "_id": "$payment_method_name",
                    "total_transactions": {"$sum": 1},
                    "total_amount": {"$sum": "$amount"}
                }
            },
            {"$sort": {"total_amount": -1}}
        ]
        method_data = list(db.student_payments.aggregate(method_pipeline))
        total_method_amount = sum(m["total_amount"] for m in method_data) or 1
        payment_methods = [
            {
                "method_name": item["_id"] or "Unknown",
                "total_transactions": item["total_transactions"],
                "total_amount": item["total_amount"],
                "percentage": round((item["total_amount"] / total_method_amount) * 100, 2)
            }
            for item in method_data
        ]
        
        total_outstanding = total_revenue - total_payouts
        
        logger.info(f"📊 Admin stats: {total_revenue} revenue, {active_sessions} active sessions")
        
        return {
            "school_id": school_id,
            "school_name": school_name,
            "total_school_revenue": total_revenue,
            "total_admin_payouts": total_payouts,
            "total_outstanding": max(0, total_outstanding),
            "total_transactions": total_txns,
            "active_sessions_count": active_sessions,
            "accountants_summary": accountants_data,
            "revenue_by_accountant": revenue_by_accountant,
            "sessions_by_accountant": sessions_by_accountant,
            "monthly_revenue_trend": monthly_trend,
            "payment_method_usage": payment_methods,
            "period_start": start.isoformat(),
            "period_end": end.isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting admin stats: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== ACCOUNTANT PERFORMANCE TABLE (TASK 3) ====================

def get_accountant_performance(
    school_id: str,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "total_collected",
    sort_order: str = "desc",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    accountant_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get accountant performance table with pagination.
    TASK 3: Accountant Activity Table
    """
    logger.info(f"👤 Accountant performance table generated")
    
    try:
        db = get_db_for_request()
        start, end = get_date_range(date_from, date_to)
        
        # Build match stage
        match_stage = {
            "school_id": school_id,
            "created_at": {"$gte": start, "$lte": end}
        }
        if accountant_id:
            match_stage["received_by"] = accountant_id
            logger.info(f"🔎 Accounting statistics filtered by accountant: {accountant_id}")
        
        # Aggregation for collections
        logger.info("⚡ Optimized aggregation query executed - performance")
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": "$received_by",
                    "total_collected": {"$sum": "$amount"},
                    "transaction_count": {"$sum": 1},
                    "last_active": {"$max": "$created_at"}
                }
            }
        ]
        
        # Count total before pagination
        count_result = list(db.student_payments.aggregate(pipeline))
        total_count = len(count_result)
        
        # Sort direction
        sort_dir = -1 if sort_order.lower() == "desc" else 1
        
        # Add sort and pagination
        pipeline.append({"$sort": {sort_by: sort_dir}})
        pipeline.append({"$skip": (page - 1) * page_size})
        pipeline.append({"$limit": page_size})
        
        results = list(db.student_payments.aggregate(pipeline))
        
        # Enrich with user info and calculate additional fields
        rows = []
        for item in results:
            acct_id = item["_id"]
            if not acct_id:
                continue
            
            user = db.users.find_one(
                {"_id": ObjectId(acct_id) if ObjectId.is_valid(acct_id) else None},
                {"name": 1, "email": 1}
            )
            if not user:
                user = {"name": "Unknown", "email": "unknown"}
            
            # Sessions count
            sessions = db.accounting_sessions.count_documents({
                "school_id": school_id,
                "user_id": acct_id
            })
            
            # Outstanding
            payouts_res = list(db.principal_payments.aggregate([
                {"$match": {"school_id": school_id, "accountant_id": acct_id, "status": "APPROVED"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
            ]))
            total_paid = payouts_res[0]["total"] if payouts_res else 0.0
            outstanding = item["total_collected"] - total_paid
            
            # Average daily
            days_active = (end - start).days or 1
            avg_daily = item["total_collected"] / days_active
            
            rows.append({
                "accountant_id": acct_id,
                "accountant_name": user.get("name", "Unknown"),
                "accountant_email": user.get("email", "unknown"),
                "total_collected": item["total_collected"],
                "transaction_count": item["transaction_count"],
                "sessions_opened": sessions,
                "outstanding_balance": max(0, outstanding),
                "avg_daily_collection": round(avg_daily, 2),
                "last_active": item["last_active"].isoformat() if item.get("last_active") else None
            })
        
        total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1
        
        logger.info(f"📑 Paginated results loaded: page {page}/{total_pages}")
        
        return {
            "data": rows,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting accountant performance: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== PAYMENT METHOD ANALYTICS (TASK 4) ====================

def get_payment_method_stats(
    school_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get payment method analytics.
    TASK 4: Payment Method Analytics
    """
    logger.info(f"💳 Payment method analytics generated")
    
    try:
        db = get_db_for_request()
        start, end = get_date_range(date_from, date_to)
        
        match_stage = {
            "school_id": school_id,
            "created_at": {"$gte": start, "$lte": end}
        }
        
        if date_from or date_to:
            logger.info(f"🔎 Accounting statistics filtered by date: {date_from} to {date_to}")
        
        logger.info("⚡ Optimized aggregation query executed - payment methods")
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": "$payment_method_name",
                    "total_transactions": {"$sum": 1},
                    "total_amount": {"$sum": "$amount"}
                }
            },
            {"$sort": {"total_amount": -1}}
        ]
        
        results = list(db.student_payments.aggregate(pipeline))
        
        total_amount = sum(r["total_amount"] for r in results) or 1
        total_txns = sum(r["total_transactions"] for r in results)
        
        data = [
            {
                "method_name": item["_id"] or "Unknown",
                "total_transactions": item["total_transactions"],
                "total_amount": item["total_amount"],
                "percentage": round((item["total_amount"] / total_amount) * 100, 2)
            }
            for item in results
        ]
        
        return {
            "data": data,
            "total_transactions": total_txns,
            "total_amount": total_amount
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting payment method stats: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== CLASS REVENUE STATS (TASK 5) ====================

def get_class_revenue_stats(
    school_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    class_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get revenue statistics per class.
    TASK 5: Class Revenue Statistics
    """
    logger.info(f"🏫 Class revenue statistics calculated")
    
    try:
        db = get_db_for_request()
        start, end = get_date_range(date_from, date_to)
        
        match_stage = {
            "school_id": school_id,
            "created_at": {"$gte": start, "$lte": end}
        }
        
        if class_id:
            match_stage["student_snapshot.class_id"] = class_id
            logger.info(f"🔎 Accounting statistics filtered by class: {class_id}")
        
        logger.info("⚡ Optimized aggregation query executed - class revenue")
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": "$student_snapshot.class_name",
                    "total_revenue": {"$sum": "$amount"},
                    "transaction_count": {"$sum": 1},
                    "students": {"$addToSet": "$student_id"}
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "total_revenue": 1,
                    "transaction_count": 1,
                    "student_count": {"$size": "$students"}
                }
            },
            {"$sort": {"total_revenue": -1}}
        ]
        
        results = list(db.student_payments.aggregate(pipeline))
        
        total_revenue = sum(r["total_revenue"] for r in results)
        total_students = sum(r["student_count"] for r in results)
        
        data = [
            {
                "class_name": item["_id"] or "Unknown",
                "total_revenue": item["total_revenue"],
                "student_count": item["student_count"],
                "transaction_count": item["transaction_count"]
            }
            for item in results
        ]
        
        return {
            "data": data,
            "total_revenue": total_revenue,
            "total_students": total_students
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting class revenue stats: {e}")
        logger.error(traceback.format_exc())
        raise


# ==================== ACTIVITY TIMELINE (TASK 6) ====================

def get_activity_timeline(
    school_id: str,
    page: int = 1,
    page_size: int = 20,
    activity_types: Optional[List[str]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    accountant_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get activity timeline with all accounting events.
    TASK 6: Daily Activity Timeline
    """
    logger.info(f"🕒 Accounting activity timeline generated")
    
    try:
        db = get_db_for_request()
        start, end = get_date_range(date_from, date_to)
        
        activities = []
        
        # Build filters
        payment_match = {"school_id": school_id, "created_at": {"$gte": start, "$lte": end}}
        session_match = {"school_id": school_id}
        payout_match = {"school_id": school_id, "created_at": {"$gte": start, "$lte": end}}
        
        if accountant_id:
            payment_match["received_by"] = accountant_id
            session_match["user_id"] = accountant_id
            payout_match["accountant_id"] = accountant_id
            logger.info(f"🔎 Accounting statistics filtered by accountant: {accountant_id}")
        
        # Filter session by date using opened_at/closed_at since session_date is string
        session_match["$or"] = [
            {"opened_at": {"$gte": start, "$lte": end}},
            {"closed_at": {"$gte": start, "$lte": end}}
        ]
        
        should_include = lambda t: activity_types is None or t in activity_types
        
        # ===== STUDENT PAYMENTS =====
        if should_include("payment"):
            logger.info("⚡ Optimized aggregation query executed - payments timeline")
            payments = list(db.student_payments.find(
                payment_match,
                {
                    "_id": 1, "amount": 1, "created_at": 1,
                    "received_by": 1, "received_by_name": 1,
                    "student_snapshot.student_name": 1
                }
            ).sort("created_at", -1).limit(page_size * 2))
            
            for p in payments:
                activities.append({
                    "id": str(p["_id"]),
                    "activity_type": "payment",
                    "description": f"Payment received from {p.get('student_snapshot', {}).get('student_name', 'Unknown')}",
                    "amount": p.get("amount", 0),
                    "actor_name": p.get("received_by_name", "Unknown"),
                    "actor_id": p.get("received_by", ""),
                    "timestamp": p["created_at"],
                    "metadata": {}
                })
        
        # ===== ADMIN CASH SUBMISSIONS =====
        if should_include("admin_payout"):
            logger.info("⚡ Optimized aggregation query executed - payouts timeline")
            payouts = list(db.principal_payments.find(
                payout_match,
                {"_id": 1, "amount": 1, "created_at": 1, "accountant_id": 1, "status": 1}
            ).sort("created_at", -1).limit(page_size * 2))
            
            for po in payouts:
                user = db.users.find_one(
                    {"_id": ObjectId(po["accountant_id"]) if ObjectId.is_valid(po.get("accountant_id", "")) else None},
                    {"name": 1}
                )
                name = user.get("name", "Unknown") if user else "Unknown"
                activities.append({
                    "id": str(po["_id"]),
                    "activity_type": "admin_payout",
                    "description": f"Admin cash submission ({po.get('status', 'PENDING')})",
                    "amount": po.get("amount", 0),
                    "actor_name": name,
                    "actor_id": po.get("accountant_id", ""),
                    "timestamp": po["created_at"],
                    "metadata": {"status": po.get("status")}
                })
        
        # ===== SESSION EVENTS =====
        if should_include("session_open") or should_include("session_close"):
            logger.info("⚡ Optimized aggregation query executed - sessions timeline")
            sessions = list(db.accounting_sessions.find(
                session_match,
                {"_id": 1, "user_id": 1, "user_name": 1, "status": 1, "opened_at": 1, "closed_at": 1}
            ).limit(page_size * 2))
            
            for s in sessions:
                if should_include("session_open") and s.get("opened_at"):
                    if start <= s["opened_at"] <= end:
                        activities.append({
                            "id": f"{s['_id']}_open",
                            "activity_type": "session_open",
                            "description": f"Session opened",
                            "amount": None,
                            "actor_name": s.get("user_name", "Unknown"),
                            "actor_id": s.get("user_id", ""),
                            "timestamp": s["opened_at"],
                            "metadata": {}
                        })
                
                if should_include("session_close") and s.get("closed_at"):
                    if start <= s["closed_at"] <= end:
                        activities.append({
                            "id": f"{s['_id']}_close",
                            "activity_type": "session_close",
                            "description": f"Session closed",
                            "amount": None,
                            "actor_name": s.get("user_name", "Unknown"),
                            "actor_id": s.get("user_id", ""),
                            "timestamp": s["closed_at"],
                            "metadata": {}
                        })
        
        # Sort by timestamp descending
        activities.sort(key=lambda x: x["timestamp"], reverse=True)
        
        # Pagination
        total_count = len(activities)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated = activities[start_idx:end_idx]
        
        # Convert timestamps to ISO strings
        for a in paginated:
            if isinstance(a["timestamp"], datetime):
                a["timestamp"] = a["timestamp"].isoformat()
        
        total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1
        
        logger.info(f"📑 Paginated results loaded: page {page}/{total_pages}")
        
        return {
            "data": paginated,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting activity timeline: {e}")
        logger.error(traceback.format_exc())
        raise
