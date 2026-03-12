"""
Finance Analytics Models
MODULE 3: Financial Analytics & Reporting Dashboard
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime


# ==================== FINANCIAL SUMMARY ====================

class FinanceSummaryResponse(BaseModel):
    """Financial summary for dashboard cards"""
    total_collected_today: float = Field(description="Total fees collected today")
    total_collected_month: float = Field(description="Total fees collected this month")
    outstanding_fees: float = Field(description="Total outstanding student fees")
    principal_payouts_total: float = Field(description="Total paid to admin")
    active_sessions: int = Field(description="Number of active accounting sessions")


# ==================== MONTHLY COLLECTION TREND ====================

class MonthlyCollectionData(BaseModel):
    """Monthly collection data point"""
    month: str = Field(description="Month name (e.g., 'Jan', 'Feb')")
    total: float = Field(description="Total collection for the month")
    year: int = Field(description="Year")


class MonthlyCollectionResponse(BaseModel):
    """Monthly collection trend response"""
    data: List[MonthlyCollectionData]
    total: float = Field(description="Grand total across all months")


# ==================== CLASS REVENUE ====================

class ClassRevenueData(BaseModel):
    """Class revenue data point"""
    class_name: str = Field(description="Class name")
    revenue: float = Field(description="Total revenue from class")
    student_count: int = Field(description="Number of students")


class ClassRevenueResponse(BaseModel):
    """Class-wise revenue response"""
    data: List[ClassRevenueData]
    total: float = Field(description="Total revenue across all classes")


# ==================== OUTSTANDING FEES ====================

class StudentOutstandingFee(BaseModel):
    """Student with outstanding fees"""
    student_id: str
    student_name: str
    class_name: str
    outstanding_amount: float
    last_payment_date: Optional[datetime] = None


class OutstandingFeesResponse(BaseModel):
    """Outstanding fees analytics"""
    total_outstanding: float = Field(description="Total outstanding amount")
    students_with_dues: int = Field(description="Number of students with dues")
    top_10_students: List[StudentOutstandingFee] = Field(description="Top 10 students with highest dues")


# ==================== ACCOUNTANT PERFORMANCE ====================

class AccountantPerformanceData(BaseModel):
    """Accountant performance data"""
    accountant_id: str
    accountant_name: str
    total_collected: float = Field(description="Total amount collected")
    transaction_count: int = Field(description="Number of transactions")
    sessions_count: int = Field(description="Number of sessions opened")


class AccountantPerformanceResponse(BaseModel):
    """Accountant performance analytics"""
    data: List[AccountantPerformanceData]
    total_collected: float = Field(description="Total collected by all accountants")


# ==================== ADMIN CASH SUBMISSIONS ====================

class PrincipalPayoutData(BaseModel):
    """Admin cash submission record"""
    id: str
    amount: float
    payment_method: str
    accountant_name: str
    created_at: datetime
    approved_at: Optional[datetime] = None
    approved_by_name: Optional[str] = None
    status: str


class PrincipalPayoutSummaryResponse(BaseModel):
    """Admin cash submission summary"""
    total_payouts: float = Field(description="Total payouts all time")
    payouts_this_month: float = Field(description="Payouts this month")
    last_10_payouts: List[PrincipalPayoutData] = Field(description="Last 10 payout records")


# ==================== REPORTS ====================

class StudentPaymentReportRecord(BaseModel):
    """Student payment report record"""
    payment_id: str
    student_name: str
    class_name: str
    amount: float
    payment_method: str
    accountant_name: str
    created_at: datetime


class StudentPaymentReportResponse(BaseModel):
    """Student payment report"""
    payments: List[StudentPaymentReportRecord]
    total_amount: float
    total_count: int
    date_range: str


class MonthlyCollectionReportRecord(BaseModel):
    """Monthly collection report record"""
    month: str
    year: int
    total_collected: float
    payment_count: int
    unique_students: int


class MonthlyCollectionReportResponse(BaseModel):
    """Monthly collection report"""
    records: List[MonthlyCollectionReportRecord]
    grand_total: float


class AccountantCollectionReportRecord(BaseModel):
    """Accountant collection report record"""
    accountant_name: str
    date: date
    total_collected: float
    transaction_count: int


class AccountantCollectionReportResponse(BaseModel):
    """Accountant collection report"""
    records: List[AccountantCollectionReportRecord]
    total_collected: float


# ==================== FILTERS ====================

class FinanceReportFilters(BaseModel):
    """Filters for finance reports"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    class_name: Optional[str] = None
    accountant_id: Optional[str] = None


# ==================== OUTSTANDING FEES DISTRIBUTION ====================

class OutstandingFeesDistribution(BaseModel):
    """Outstanding fees distribution for pie chart"""
    range_label: str = Field(description="Fee range (e.g., '0-1000', '1000-5000')")
    student_count: int = Field(description="Number of students in this range")
    total_amount: float = Field(description="Total outstanding in this range")
