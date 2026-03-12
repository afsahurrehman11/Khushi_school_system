"""
Accounting Statistics Models - MODULE 5
Advanced Accounting Statistics & Visual Reports
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum


# ==================== ENUMS ====================

class StatsPeriod(str, Enum):
    TODAY = "today"
    THIS_WEEK = "this_week"
    THIS_MONTH = "this_month"
    THIS_YEAR = "this_year"
    CUSTOM = "custom"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


class ActivityType(str, Enum):
    PAYMENT = "payment"
    ADMIN_PAYOUT = "admin_payout"
    SESSION_OPEN = "session_open"
    SESSION_CLOSE = "session_close"


# ==================== SHARED MODELS ====================

class DailyTrendItem(BaseModel):
    """Daily collection data point for trend charts"""
    date: str
    amount: float
    count: int


class PaymentMethodStat(BaseModel):
    """Payment method statistics"""
    method_name: str
    total_transactions: int
    total_amount: float
    percentage: float = 0.0


class ClassRevenueStat(BaseModel):
    """Class revenue statistics"""
    class_name: str
    total_revenue: float
    student_count: int
    transaction_count: int


class ActivityTimelineItem(BaseModel):
    """Activity timeline entry"""
    id: str
    activity_type: ActivityType
    description: str
    amount: Optional[float] = None
    actor_name: str
    actor_id: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None


# ==================== ACCOUNTANT PERSONAL STATS ====================

class AccountantPersonalStats(BaseModel):
    """Accountant's personal statistics dashboard data"""
    accountant_id: str
    accountant_name: str
    accountant_email: str
    
    # Summary stats
    total_collected_today: float = 0.0
    total_collected_month: float = 0.0
    total_transactions_today: int = 0
    total_sessions_opened: int = 0
    current_outstanding_balance: float = 0.0
    
    # Trends
    daily_collection_trend: List[DailyTrendItem] = []
    payment_method_distribution: List[PaymentMethodStat] = []
    collection_by_class: List[ClassRevenueStat] = []
    
    # Session info
    current_session_status: str = "CLOSED"
    current_session_id: Optional[str] = None


class AccountantPersonalStatsResponse(BaseModel):
    """API response for accountant personal stats"""
    success: bool = True
    data: AccountantPersonalStats


# ==================== ADMIN GLOBAL STATS ====================

class AccountantSummary(BaseModel):
    """Summary of individual accountant performance"""
    accountant_id: str
    accountant_name: str
    accountant_email: str
    total_collected: float = 0.0
    transaction_count: int = 0
    sessions_opened: int = 0
    outstanding_balance: float = 0.0
    is_active_session: bool = False


class AdminGlobalStats(BaseModel):
    """Admin global statistics dashboard data"""
    school_id: str
    school_name: str
    
    # Overall summary
    total_school_revenue: float = 0.0
    total_admin_payouts: float = 0.0
    total_outstanding: float = 0.0
    total_transactions: int = 0
    active_sessions_count: int = 0
    
    # By accountant
    accountants_summary: List[AccountantSummary] = []
    revenue_by_accountant: List[Dict[str, Any]] = []
    sessions_by_accountant: List[Dict[str, Any]] = []
    
    # Trends
    monthly_revenue_trend: List[DailyTrendItem] = []
    payment_method_usage: List[PaymentMethodStat] = []
    
    # Period
    period_start: str
    period_end: str


class AdminGlobalStatsResponse(BaseModel):
    """API response for admin global stats"""
    success: bool = True
    data: AdminGlobalStats


# ==================== ACCOUNTANT PERFORMANCE TABLE ====================

class AccountantPerformanceRow(BaseModel):
    """Row data for accountant performance table"""
    accountant_id: str
    accountant_name: str
    accountant_email: str
    total_collected: float = 0.0
    transaction_count: int = 0
    sessions_opened: int = 0
    outstanding_balance: float = 0.0
    avg_daily_collection: float = 0.0
    last_active: Optional[datetime] = None


class AccountantPerformanceRequest(BaseModel):
    """Request parameters for accountant performance"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = Field(default="total_collected")
    sort_order: SortOrder = Field(default=SortOrder.DESC)
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    accountant_id: Optional[str] = None


class AccountantPerformanceResponse(BaseModel):
    """API response for accountant performance table"""
    success: bool = True
    data: List[AccountantPerformanceRow]
    total_count: int
    page: int
    page_size: int
    total_pages: int


# ==================== PAYMENT METHOD ANALYTICS ====================

class PaymentMethodAnalyticsResponse(BaseModel):
    """API response for payment method analytics"""
    success: bool = True
    data: List[PaymentMethodStat]
    total_transactions: int
    total_amount: float


# ==================== CLASS REVENUE STATS ====================

class ClassRevenueStatsResponse(BaseModel):
    """API response for class revenue statistics"""
    success: bool = True
    data: List[ClassRevenueStat]
    total_revenue: float
    total_students: int


# ==================== ACTIVITY TIMELINE ====================

class ActivityTimelineRequest(BaseModel):
    """Request parameters for activity timeline"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    activity_types: Optional[List[ActivityType]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    accountant_id: Optional[str] = None


class ActivityTimelineResponse(BaseModel):
    """API response for activity timeline"""
    success: bool = True
    data: List[ActivityTimelineItem]
    total_count: int
    page: int
    page_size: int
    total_pages: int


# ==================== FILTER MODELS ====================

class StatsFilterParams(BaseModel):
    """Common filter parameters for statistics endpoints"""
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    accountant_id: Optional[str] = None
    class_id: Optional[str] = None
    payment_method: Optional[str] = None
    

class PaginationParams(BaseModel):
    """Common pagination parameters"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
