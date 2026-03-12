"""
Finance Analytics Router
MODULE 3: Financial Analytics & Reporting Dashboard

Security: Only admin can access
Multi-tenant: Uses get_db_for_request()
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pymongo.database import Database
from typing import Optional
from datetime import date
import csv
import io
import logging

from app.middleware.database_routing import get_db_for_request
from app.dependencies.auth import get_current_user
from app.services.finance_service import finance_service
from app.models.finance import (
    FinanceSummaryResponse,
    MonthlyCollectionResponse,
    ClassRevenueResponse,
    OutstandingFeesResponse,
    AccountantPerformanceResponse,
    PrincipalPayoutSummaryResponse,
    StudentPaymentReportResponse,
    MonthlyCollectionReportResponse,
    AccountantCollectionReportResponse,
    OutstandingFeesDistribution,
)

router = APIRouter(prefix="/finance", tags=["Finance Analytics"])
logger = logging.getLogger(__name__)


# ==================== SECURITY MIDDLEWARE ====================

def verify_finance_access(current_user: dict = Depends(get_current_user)):
    """Verify user has finance analytics access (admin only)"""
    if current_user.get("role") != "admin":
        logger.warning(f"⚠️ Unauthorized finance analytics access attempt by {current_user.get('email')} (role: {current_user.get('role')})")
        raise HTTPException(
            status_code=403,
            detail="Only admin can access financial analytics"
        )
    return current_user


# ==================== DASHBOARD ENDPOINTS ====================

@router.get("/summary", response_model=FinanceSummaryResponse)
async def get_finance_summary(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get financial summary for dashboard cards
    
    Returns:
    - Total collected today
    - Total collected this month
    - Outstanding fees
    - Principal payouts total
    - Active accounting sessions
    """
    return await finance_service.get_financial_summary(db)


@router.get("/monthly-collection", response_model=MonthlyCollectionResponse)
async def get_monthly_collection_trend(
    months: int = Query(12, ge=1, le=24, description="Number of months to retrieve"),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get monthly collection trend for line chart
    
    Returns monthly collection data for the last N months
    """
    return await finance_service.get_monthly_collection_trend(db, months)


@router.get("/class-revenue", response_model=ClassRevenueResponse)
async def get_class_revenue(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get class-wise revenue analytics for bar chart
    
    Returns revenue breakdown by class
    """
    return await finance_service.get_class_revenue(db)


@router.get("/outstanding-fees", response_model=OutstandingFeesResponse)
async def get_outstanding_fees(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get outstanding fees analytics
    
    Returns:
    - Total outstanding amount
    - Number of students with dues
    - Top 10 students with highest dues
    """
    return await finance_service.get_outstanding_fees_analytics(db)


@router.get("/accountant-performance", response_model=AccountantPerformanceResponse)
async def get_accountant_performance(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get accountant performance analytics for bar chart
    
    Returns collection stats per accountant
    """
    return await finance_service.get_accountant_performance(db)


@router.get("/principal-payouts", response_model=PrincipalPayoutSummaryResponse)
async def get_principal_payouts(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get principal payout summary
    
    Returns:
    - Total payouts all time
    - Payouts this month
    - Last 10 payout records
    """
    return await finance_service.get_principal_payout_summary(db)


@router.get("/outstanding-distribution")
async def get_outstanding_distribution(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get outstanding fees distribution for pie chart
    
    Returns distribution of outstanding fees by amount ranges
    """
    return await finance_service.get_outstanding_fees_distribution(db)


# ==================== REPORTS ENDPOINTS ====================

@router.get("/reports/student-payments", response_model=StudentPaymentReportResponse)
async def get_student_payment_report(
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    class_name: Optional[str] = Query(None, description="Filter by class"),
    accountant_id: Optional[str] = Query(None, description="Filter by accountant"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum records"),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get student payment report with filters
    
    Supports filtering by:
    - Date range
    - Class
    - Accountant
    """
    return await finance_service.get_student_payment_report(
        db, start_date, end_date, class_name, accountant_id, limit
    )


@router.get("/reports/monthly-collections", response_model=MonthlyCollectionReportResponse)
async def get_monthly_collection_report(
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get monthly collection report
    
    Returns aggregated collections by month
    """
    return await finance_service.get_monthly_collection_report(db, start_date, end_date)


@router.get("/reports/accountant-collections", response_model=AccountantCollectionReportResponse)
async def get_accountant_collection_report(
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    accountant_id: Optional[str] = Query(None, description="Filter by accountant"),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Get accountant collection report
    
    Returns daily collections per accountant
    """
    return await finance_service.get_accountant_collection_report(
        db, start_date, end_date, accountant_id
    )


# ==================== EXPORT ENDPOINTS ====================

@router.get("/export/student-payments")
async def export_student_payments_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    class_name: Optional[str] = Query(None),
    accountant_id: Optional[str] = Query(None),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Export student payments report as CSV
    
    Returns CSV file with all payment records matching filters
    """
    logger.info(f"📤 Financial report exported by {current_user.get('email')}")
    
    # Get report data
    report = await finance_service.get_student_payment_report(
        db, start_date, end_date, class_name, accountant_id, limit=10000
    )
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Payment ID",
        "Student Name",
        "Class",
        "Amount",
        "Payment Method",
        "Accountant",
        "Date"
    ])
    
    # Write data
    for payment in report.payments:
        writer.writerow([
            payment.payment_id,
            payment.student_name,
            payment.class_name,
            payment.amount,
            payment.payment_method,
            payment.accountant_name,
            payment.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    # Write summary
    writer.writerow([])
    writer.writerow(["Total Amount", report.total_amount])
    writer.writerow(["Total Count", report.total_count])
    writer.writerow(["Date Range", report.date_range])
    
    # Return as streaming response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=student_payments_{date.today()}.csv"
        }
    )


@router.get("/export/monthly-collections")
async def export_monthly_collections_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Export monthly collections report as CSV
    """
    logger.info(f"📤 Financial report exported by {current_user.get('email')}")
    
    # Get report data
    report = await finance_service.get_monthly_collection_report(db, start_date, end_date)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Month",
        "Year",
        "Total Collected",
        "Payment Count",
        "Unique Students"
    ])
    
    # Write data
    for record in report.records:
        writer.writerow([
            record.month,
            record.year,
            record.total_collected,
            record.payment_count,
            record.unique_students
        ])
    
    # Write summary
    writer.writerow([])
    writer.writerow(["Grand Total", report.grand_total])
    
    # Return as streaming response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=monthly_collections_{date.today()}.csv"
        }
    )


@router.get("/export/principal-payouts")
async def export_principal_payouts_csv(
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Export principal payouts report as CSV
    """
    logger.info(f"📤 Financial report exported by {current_user.get('email')}")
    
    # Get all approved principal payments
    payouts = db.principal_payments.find({"status": "APPROVED"}).sort("created_at", -1)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Payment ID",
        "Amount",
        "Payment Method",
        "Accountant",
        "Created At",
        "Approved At",
        "Approved By"
    ])
    
    # Write data
    total_amount = 0.0
    count = 0
    for payout in payouts:
        writer.writerow([
            str(payout["_id"]),
            payout["amount"],
            payout["payment_method"],
            payout.get("accountant_name", "Unknown"),
            payout["created_at"].strftime("%Y-%m-%d %H:%M:%S"),
            payout.get("approved_at", "").strftime("%Y-%m-%d %H:%M:%S") if payout.get("approved_at") else "",
            payout.get("approved_by_name", "")
        ])
        total_amount += payout["amount"]
        count += 1
    
    # Write summary
    writer.writerow([])
    writer.writerow(["Total Amount", total_amount])
    writer.writerow(["Total Count", count])
    
    # Return as streaming response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=principal_payouts_{date.today()}.csv"
        }
    )


@router.get("/export/accountant-collections")
async def export_accountant_collections_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    accountant_id: Optional[str] = Query(None),
    db: Database = Depends(get_db_for_request),
    current_user: dict = Depends(verify_finance_access)
):
    """
    Export accountant collections report as CSV
    """
    logger.info(f"📤 Financial report exported by {current_user.get('email')}")
    
    # Get report data
    report = await finance_service.get_accountant_collection_report(
        db, start_date, end_date, accountant_id
    )
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Accountant Name",
        "Date",
        "Total Collected",
        "Transaction Count"
    ])
    
    # Write data
    for record in report.records:
        writer.writerow([
            record.accountant_name,
            record.date.strftime("%Y-%m-%d"),
            record.total_collected,
            record.transaction_count
        ])
    
    # Write summary
    writer.writerow([])
    writer.writerow(["Total Collected", report.total_collected])
    
    # Return as streaming response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=accountant_collections_{date.today()}.csv"
        }
    )
