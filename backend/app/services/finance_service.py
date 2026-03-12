"""
Finance Analytics Service
MODULE 3: Financial Analytics & Reporting Dashboard

Uses MongoDB aggregations for efficient analytics
Maintains multi-tenant isolation using get_db_for_request()
"""

from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from pymongo.database import Database
from bson import ObjectId
import calendar
import logging

from app.models.finance import (
    FinanceSummaryResponse,
    MonthlyCollectionData,
    MonthlyCollectionResponse,
    ClassRevenueData,
    ClassRevenueResponse,
    OutstandingFeesResponse,
    StudentOutstandingFee,
    AccountantPerformanceData,
    AccountantPerformanceResponse,
    PrincipalPayoutData,
    PrincipalPayoutSummaryResponse,
    StudentPaymentReportRecord,
    StudentPaymentReportResponse,
    MonthlyCollectionReportRecord,
    MonthlyCollectionReportResponse,
    AccountantCollectionReportRecord,
    AccountantCollectionReportResponse,
    OutstandingFeesDistribution,
)

logger = logging.getLogger(__name__)


class FinanceAnalyticsService:
    """Service for finance analytics and reporting"""
    
    # ==================== FINANCIAL SUMMARY ====================
    
    @staticmethod
    async def get_financial_summary(db: Database) -> FinanceSummaryResponse:
        """Get financial summary for dashboard cards"""
        logger.info("📊 Finance summary calculated")
        
        # Get today's date range
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get this month's date range
        month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Total collected today
        today_pipeline = [
            {"$match": {"created_at": {"$gte": today_start, "$lte": today_end}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        today_result = list(db.student_payments.aggregate(today_pipeline))
        total_collected_today = today_result[0]["total"] if today_result else 0.0
        
        # Total collected this month
        month_pipeline = [
            {"$match": {"created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        month_result = list(db.student_payments.aggregate(month_pipeline))
        total_collected_month = month_result[0]["total"] if month_result else 0.0
        
        # Outstanding fees (from student_monthly_fees)
        outstanding_pipeline = [
            {"$match": {"status": "UNPAID"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        outstanding_result = list(db.student_monthly_fees.aggregate(outstanding_pipeline))
        outstanding_fees = outstanding_result[0]["total"] if outstanding_result else 0.0
        
        # Total paid to principal (approved payments)
        principal_pipeline = [
            {"$match": {"status": "APPROVED"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        principal_result = list(db.principal_payments.aggregate(principal_pipeline))
        principal_payouts_total = principal_result[0]["total"] if principal_result else 0.0
        
        # Active accounting sessions
        active_sessions = db.accounting_sessions.count_documents({"status": "OPEN"})
        
        return FinanceSummaryResponse(
            total_collected_today=total_collected_today,
            total_collected_month=total_collected_month,
            outstanding_fees=outstanding_fees,
            principal_payouts_total=principal_payouts_total,
            active_sessions=active_sessions
        )
    
    # ==================== MONTHLY COLLECTION TREND ====================
    
    @staticmethod
    async def get_monthly_collection_trend(
        db: Database,
        months: int = 12
    ) -> MonthlyCollectionResponse:
        """Get monthly collection trend for the last N months"""
        logger.info("📈 Monthly collection trend generated")
        
        # Calculate start date (N months ago)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=months * 30)
        
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$created_at"},
                        "month": {"$month": "$created_at"}
                    },
                    "total": {"$sum": "$amount"}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}}
        ]
        
        results = list(db.student_payments.aggregate(pipeline))
        
        data = []
        grand_total = 0.0
        
        for result in results:
            month_num = result["_id"]["month"]
            year = result["_id"]["year"]
            month_name = calendar.month_abbr[month_num]
            total = result["total"]
            
            data.append(MonthlyCollectionData(
                month=month_name,
                year=year,
                total=total
            ))
            grand_total += total
        
        return MonthlyCollectionResponse(data=data, total=grand_total)
    
    # ==================== CLASS REVENUE ====================
    
    @staticmethod
    async def get_class_revenue(db: Database) -> ClassRevenueResponse:
        """Get class-wise revenue analytics"""
        logger.info("🏫 Class revenue analytics generated")
        
        pipeline = [
            {
                "$group": {
                    "_id": "$student_snapshot.class_name",
                    "revenue": {"$sum": "$amount"},
                    "student_count": {"$addToSet": "$student_id"}
                }
            },
            {"$sort": {"revenue": -1}}
        ]
        
        results = list(db.student_payments.aggregate(pipeline))
        
        data = []
        total_revenue = 0.0
        
        for result in results:
            class_name = result["_id"] or "Unknown"
            revenue = result["revenue"]
            student_count = len(result["student_count"])
            
            data.append(ClassRevenueData(
                class_name=class_name,
                revenue=revenue,
                student_count=student_count
            ))
            total_revenue += revenue
        
        return ClassRevenueResponse(data=data, total=total_revenue)
    
    # ==================== OUTSTANDING FEES ====================
    
    @staticmethod
    async def get_outstanding_fees_analytics(db: Database) -> OutstandingFeesResponse:
        """Get outstanding fees analytics"""
        logger.info("🧾 Outstanding fee report generated")
        
        # Get all unpaid fees grouped by student
        pipeline = [
            {"$match": {"status": "UNPAID"}},
            {
                "$group": {
                    "_id": "$student_id",
                    "student_name": {"$first": "$student_snapshot.student_name"},
                    "class_name": {"$first": "$student_snapshot.class_name"},
                    "outstanding_amount": {"$sum": "$amount"}
                }
            },
            {"$sort": {"outstanding_amount": -1}}
        ]
        
        results = list(db.student_monthly_fees.aggregate(pipeline))
        
        total_outstanding = sum(r["outstanding_amount"] for r in results)
        students_with_dues = len(results)
        
        # Get last payment date for top 10 students
        top_10_students = []
        for result in results[:10]:
            student_id = result["_id"]
            
            # Find last payment
            last_payment = db.student_payments.find_one(
                {"student_id": student_id},
                sort=[("created_at", -1)]
            )
            
            top_10_students.append(StudentOutstandingFee(
                student_id=student_id,
                student_name=result.get("student_name", "Unknown"),
                class_name=result.get("class_name", "Unknown"),
                outstanding_amount=result["outstanding_amount"],
                last_payment_date=last_payment["created_at"] if last_payment else None
            ))
        
        return OutstandingFeesResponse(
            total_outstanding=total_outstanding,
            students_with_dues=students_with_dues,
            top_10_students=top_10_students
        )
    
    # ==================== ACCOUNTANT PERFORMANCE ====================
    
    @staticmethod
    async def get_accountant_performance(db: Database) -> AccountantPerformanceResponse:
        """Get accountant performance analytics"""
        logger.info("👤 Accountant performance analytics generated")
        
        # Get total collected by each accountant from ledger
        ledger_pipeline = [
            {"$match": {"transaction_type": "STUDENT_PAYMENT"}},
            {
                "$group": {
                    "_id": "$user_id",
                    "total_collected": {"$sum": "$credit"},
                    "transaction_count": {"$sum": 1}
                }
            }
        ]
        
        ledger_results = list(db.accountant_ledger.aggregate(ledger_pipeline))
        
        # Get session counts
        session_pipeline = [
            {
                "$group": {
                    "_id": "$user_id",
                    "sessions_count": {"$sum": 1},
                    "user_name": {"$first": "$user_name"}
                }
            }
        ]
        
        session_results = list(db.accounting_sessions.aggregate(session_pipeline))
        
        # Merge results
        accountant_map = {}
        
        for result in ledger_results:
            user_id = result["_id"]
            accountant_map[user_id] = {
                "total_collected": result["total_collected"],
                "transaction_count": result["transaction_count"],
                "sessions_count": 0,
                "user_name": None
            }
        
        for result in session_results:
            user_id = result["_id"]
            if user_id in accountant_map:
                accountant_map[user_id]["sessions_count"] = result["sessions_count"]
                accountant_map[user_id]["user_name"] = result.get("user_name")
            else:
                accountant_map[user_id] = {
                    "total_collected": 0.0,
                    "transaction_count": 0,
                    "sessions_count": result["sessions_count"],
                    "user_name": result.get("user_name")
                }
        
        # Convert to response format
        data = []
        total_collected_all = 0.0
        
        for user_id, stats in accountant_map.items():
            data.append(AccountantPerformanceData(
                accountant_id=user_id,
                accountant_name=stats["user_name"] or "Unknown",
                total_collected=stats["total_collected"],
                transaction_count=stats["transaction_count"],
                sessions_count=stats["sessions_count"]
            ))
            total_collected_all += stats["total_collected"]
        
        # Sort by total collected
        data.sort(key=lambda x: x.total_collected, reverse=True)
        
        return AccountantPerformanceResponse(
            data=data,
            total_collected=total_collected_all
        )
    
    # ==================== PRINCIPAL PAYOUTS ====================
    
    @staticmethod
    async def get_principal_payout_summary(db: Database) -> PrincipalPayoutSummaryResponse:
        """Get principal payout summary"""
        logger.info("💸 Principal payout summary generated")
        
        # Total payouts (approved)
        total_pipeline = [
            {"$match": {"status": "APPROVED"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        total_result = list(db.principal_payments.aggregate(total_pipeline))
        total_payouts = total_result[0]["total"] if total_result else 0.0
        
        # Payouts this month
        month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_pipeline = [
            {"$match": {"status": "APPROVED", "created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        month_result = list(db.principal_payments.aggregate(month_pipeline))
        payouts_this_month = month_result[0]["total"] if month_result else 0.0
        
        # Last 10 payouts
        last_payouts = db.principal_payments.find().sort("created_at", -1).limit(10)
        
        last_10_payouts = []
        for payout in last_payouts:
            last_10_payouts.append(PrincipalPayoutData(
                id=str(payout["_id"]),
                amount=payout["amount"],
                payment_method=payout["payment_method"],
                accountant_name=payout.get("accountant_name", "Unknown"),
                created_at=payout["created_at"],
                approved_at=payout.get("approved_at"),
                approved_by_name=payout.get("approved_by_name"),
                status=payout["status"]
            ))
        
        return PrincipalPayoutSummaryResponse(
            total_payouts=total_payouts,
            payouts_this_month=payouts_this_month,
            last_10_payouts=last_10_payouts
        )
    
    # ==================== REPORTS ====================
    
    @staticmethod
    async def get_student_payment_report(
        db: Database,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        class_name: Optional[str] = None,
        accountant_id: Optional[str] = None,
        limit: int = 1000
    ) -> StudentPaymentReportResponse:
        """Get student payment report with filters"""
        logger.info("📑 Loading financial reports")
        
        # Build match criteria
        match_criteria = {}
        
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = datetime.combine(start_date, datetime.min.time())
            if end_date:
                date_filter["$lte"] = datetime.combine(end_date, datetime.max.time())
            match_criteria["created_at"] = date_filter
        
        if class_name:
            match_criteria["student_snapshot.class_name"] = class_name
        
        if accountant_id:
            match_criteria["accountant_id"] = accountant_id
        
        # Get payments
        pipeline = []
        if match_criteria:
            pipeline.append({"$match": match_criteria})
        
        pipeline.extend([
            {"$sort": {"created_at": -1}},
            {"$limit": limit}
        ])
        
        results = list(db.student_payments.aggregate(pipeline))
        
        payments = []
        total_amount = 0.0
        
        for result in results:
            payments.append(StudentPaymentReportRecord(
                payment_id=str(result["_id"]),
                student_name=result.get("student_snapshot", {}).get("student_name", "Unknown"),
                class_name=result.get("student_snapshot", {}).get("class_name", "Unknown"),
                amount=result["amount"],
                payment_method=result.get("payment_method", "CASH"),
                accountant_name=result.get("accountant_name", "Unknown"),
                created_at=result["created_at"]
            ))
            total_amount += result["amount"]
        
        date_range_str = ""
        if start_date and end_date:
            date_range_str = f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"
        elif start_date:
            date_range_str = f"From {start_date.strftime('%Y-%m-%d')}"
        elif end_date:
            date_range_str = f"Until {end_date.strftime('%Y-%m-%d')}"
        else:
            date_range_str = "All time"
        
        return StudentPaymentReportResponse(
            payments=payments,
            total_amount=total_amount,
            total_count=len(payments),
            date_range=date_range_str
        )
    
    @staticmethod
    async def get_monthly_collection_report(
        db: Database,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> MonthlyCollectionReportResponse:
        """Get monthly collection report"""
        
        # Build match criteria
        match_criteria = {}
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = datetime.combine(start_date, datetime.min.time())
            if end_date:
                date_filter["$lte"] = datetime.combine(end_date, datetime.max.time())
            match_criteria["created_at"] = date_filter
        
        pipeline = []
        if match_criteria:
            pipeline.append({"$match": match_criteria})
        
        pipeline.extend([
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$created_at"},
                        "month": {"$month": "$created_at"}
                    },
                    "total_collected": {"$sum": "$amount"},
                    "payment_count": {"$sum": 1},
                    "unique_students": {"$addToSet": "$student_id"}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}}
        ])
        
        results = list(db.student_payments.aggregate(pipeline))
        
        records = []
        grand_total = 0.0
        
        for result in results:
            month_num = result["_id"]["month"]
            year = result["_id"]["year"]
            month_name = calendar.month_abbr[month_num]
            total = result["total_collected"]
            
            records.append(MonthlyCollectionReportRecord(
                month=month_name,
                year=year,
                total_collected=total,
                payment_count=result["payment_count"],
                unique_students=len(result["unique_students"])
            ))
            grand_total += total
        
        return MonthlyCollectionReportResponse(
            records=records,
            grand_total=grand_total
        )
    
    @staticmethod
    async def get_accountant_collection_report(
        db: Database,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        accountant_id: Optional[str] = None
    ) -> AccountantCollectionReportResponse:
        """Get accountant collection report"""
        
        # Build match criteria
        match_criteria = {"transaction_type": "STUDENT_PAYMENT"}
        
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = datetime.combine(start_date, datetime.min.time())
            if end_date:
                date_filter["$lte"] = datetime.combine(end_date, datetime.max.time())
            match_criteria["created_at"] = date_filter
        
        if accountant_id:
            match_criteria["user_id"] = accountant_id
        
        pipeline = [
            {"$match": match_criteria},
            {
                "$group": {
                    "_id": {
                        "user_id": "$user_id",
                        "date": {
                            "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                        }
                    },
                    "accountant_name": {"$first": "$user_name"},
                    "total_collected": {"$sum": "$credit"},
                    "transaction_count": {"$sum": 1}
                }
            },
            {"$sort": {"_id.date": -1}}
        ]
        
        results = list(db.accountant_ledger.aggregate(pipeline))
        
        records = []
        total_collected = 0.0
        
        for result in results:
            date_str = result["_id"]["date"]
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
            
            records.append(AccountantCollectionReportRecord(
                accountant_name=result.get("accountant_name", "Unknown"),
                date=date_obj,
                total_collected=result["total_collected"],
                transaction_count=result["transaction_count"]
            ))
            total_collected += result["total_collected"]
        
        return AccountantCollectionReportResponse(
            records=records,
            total_collected=total_collected
        )
    
    # ==================== OUTSTANDING FEES DISTRIBUTION ====================
    
    @staticmethod
    async def get_outstanding_fees_distribution(db: Database) -> List[OutstandingFeesDistribution]:
        """Get outstanding fees distribution for pie chart"""
        
        # Define ranges
        ranges = [
            (0, 1000, "0-1000"),
            (1000, 5000, "1K-5K"),
            (5000, 10000, "5K-10K"),
            (10000, 20000, "10K-20K"),
            (20000, float('inf'), "20K+")
        ]
        
        # Get all unpaid fees
        unpaid_fees = db.student_monthly_fees.find({"status": "UNPAID"})
        
        # Group by ranges
        distribution = {label: {"count": 0, "total": 0.0} for _, _, label in ranges}
        
        for fee in unpaid_fees:
            amount = fee["amount"]
            for min_val, max_val, label in ranges:
                if min_val <= amount < max_val:
                    distribution[label]["count"] += 1
                    distribution[label]["total"] += amount
                    break
        
        # Convert to response format
        result = []
        for _, _, label in ranges:
            if distribution[label]["count"] > 0:
                result.append(OutstandingFeesDistribution(
                    range_label=label,
                    student_count=distribution[label]["count"],
                    total_amount=distribution[label]["total"]
                ))
        
        return result


# Create singleton instance
finance_service = FinanceAnalyticsService()
