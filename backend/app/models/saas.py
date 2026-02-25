"""
SaaS Multi-Tenant Models
Models for the root SaaS database (saas_root_db)
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
from enum import Enum

if TYPE_CHECKING:
    from . import SaaSSchoolResponse


# ================= Enums =================

class SchoolPlan(str, Enum):
    TRIAL = "trial"
    BASIC = "basic"
    STANDARD = "standard"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


class SchoolStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"
    PENDING = "pending"


# ================= SaaS School Models =================

class SaaSSchoolCreate(BaseModel):
    """Schema for creating a new school with admin credentials"""
    school_name: str = Field(..., min_length=2, max_length=100, description="School display name")
    admin_email: str = Field(..., description="Gmail/Email for school admin login")
    admin_password: str = Field(..., min_length=6, description="Password for school admin")
    admin_name: str = Field(default="School Admin", description="Admin user's display name")
    plan: SchoolPlan = Field(default=SchoolPlan.TRIAL, description="Subscription plan")
    
    # Optional school details
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    logo_url: Optional[str] = None
    
    @validator('school_name')
    def normalize_school_name(cls, v):
        """Normalize school name - strip whitespace"""
        return v.strip() if v else v
    
    @validator('admin_email')
    def normalize_email(cls, v):
        """Normalize email to lowercase"""
        return v.lower().strip() if v else v


class SaaSSchoolInDB(BaseModel):
    """School record as stored in saas_root_db.schools"""
    id: Optional[str] = None
    school_id: str  # UUID or ObjectId string
    school_name: str  # Display name
    school_slug: str  # Unique, lowercase, no spaces - used for email domains
    database_name: str  # Actual MongoDB database name
    admin_email: str
    hashed_password: str  # Stored hashed password
    plan: SchoolPlan = SchoolPlan.TRIAL
    status: SchoolStatus = SchoolStatus.ACTIVE
    
    # Optional details
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    logo_url: Optional[str] = None
    
    # Payment/Suspension settings
    payment_due_day: Optional[int] = None  # Day of month (1-28) when payment is due
    auto_suspend_enabled: bool = False  # Whether to auto-suspend after due date
    grace_period_days: int = 3  # Days after due date before auto-suspension
    last_payment_date: Optional[datetime] = None  # When they last paid
    next_payment_due: Optional[datetime] = None  # Next payment due date
    suspension_reason: Optional[str] = None  # Reason if suspended
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    suspended_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    
    # Stats cache (updated by daily job)
    student_count: int = 0
    teacher_count: int = 0
    storage_bytes: int = 0
    last_stats_update: Optional[datetime] = None


class SaaSSchoolResponse(BaseModel):
    """Response model for school data (excludes sensitive fields)"""
    id: str
    school_id: str
    school_name: str
    school_slug: str
    database_name: str
    admin_email: str
    plan: SchoolPlan
    status: SchoolStatus
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    created_at: datetime
    student_count: int = 0
    teacher_count: int = 0
    storage_bytes: int = 0
    # Payment/Suspension fields
    payment_due_day: Optional[int] = None
    auto_suspend_enabled: bool = False
    grace_period_days: int = 3
    last_payment_date: Optional[datetime] = None
    next_payment_due: Optional[datetime] = None
    suspension_reason: Optional[str] = None
    suspended_at: Optional[datetime] = None


class SaaSSchoolUpdate(BaseModel):
    """Update school information"""
    school_name: Optional[str] = None
    plan: Optional[SchoolPlan] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    logo_url: Optional[str] = None


class SaaSSchoolSuspend(BaseModel):
    """Suspend school request"""
    reason: Optional[str] = None


class SaaSSchoolPaymentSettings(BaseModel):
    """Update school payment/suspension settings"""
    payment_due_day: Optional[int] = Field(None, ge=1, le=28, description="Day of month (1-28)")
    auto_suspend_enabled: Optional[bool] = None
    grace_period_days: Optional[int] = Field(None, ge=0, le=30)
    next_payment_due: Optional[datetime] = None


class SaaSSchoolRecordPayment(BaseModel):
    """Record a payment for a school"""
    amount: float = Field(..., gt=0)
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None


class SaaSPasswordReset(BaseModel):
    """Reset school admin password"""
    new_password: str = Field(..., min_length=6, description="New password for admin")


# ================= Usage Snapshot Models =================

class UsageSnapshot(BaseModel):
    """Daily usage snapshot for a school"""
    id: Optional[str] = None
    school_id: str
    database_name: str
    date: datetime  # Date of snapshot (midnight UTC)
    
    # Database stats from dbStats()
    storage_bytes: int = 0
    data_size: int = 0
    index_size: int = 0
    object_count: int = 0
    collection_count: int = 0
    
    # Entity counts
    student_count: int = 0
    teacher_count: int = 0
    user_count: int = 0
    
    created_at: datetime


class UsageSnapshotResponse(BaseModel):
    """Response for usage snapshot data"""
    school_id: str
    school_name: str
    database_name: str
    date: datetime
    storage_bytes: int
    object_count: int
    student_count: int
    teacher_count: int


# ================= Analytics Models =================

class SaaSOverviewStats(BaseModel):
    """Overview statistics for SaaS dashboard"""
    total_schools: int = 0
    active_schools: int = 0
    suspended_schools: int = 0
    total_students: int = 0
    total_teachers: int = 0
    total_storage_bytes: int = 0
    
    # Plan distribution
    trial_schools: int = 0
    basic_schools: int = 0
    standard_schools: int = 0
    premium_schools: int = 0
    enterprise_schools: int = 0


class SchoolStorageHistory(BaseModel):
    """Storage usage history for a school"""
    school_id: str
    school_name: str
    history: List[dict]  # [{date: str, storage_bytes: int}]


# ================= Global Users Models (Central Auth) =================

class GlobalUserRole(str, Enum):
    """User roles in the system"""
    ROOT = "root"
    ADMIN = "admin"
    STAFF = "staff"


class GlobalUserCreate(BaseModel):
    """Schema for creating a user in global_users"""
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., description="Unique email for authentication")
    password: str = Field(..., min_length=6)
    role: GlobalUserRole
    school_id: Optional[str] = None  # Nullable for root users
    school_slug: Optional[str] = None  # Nullable for root users
    database_name: Optional[str] = None  # Nullable for root users


class GlobalUserInDB(BaseModel):
    """Global user as stored in saas_root_db.global_users"""
    id: Optional[str] = None
    name: str
    email: str  # Unique, indexed
    password_hash: str
    role: GlobalUserRole
    school_id: Optional[str] = None  # Nullable for root
    school_slug: Optional[str] = None  # Nullable for root  
    database_name: Optional[str] = None  # Nullable for root
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None


class GlobalUserResponse(BaseModel):
    """Response model for global user (excludes password)"""
    id: str
    name: str
    email: str
    role: GlobalUserRole
    school_id: Optional[str] = None
    school_slug: Optional[str] = None
    database_name: Optional[str] = None
    is_active: bool
    created_at: datetime


class StaffCreate(BaseModel):
    """Schema for admin creating staff users"""
    name: str = Field(..., min_length=1, max_length=100)
    email_prefix: str = Field(..., min_length=1, max_length=50, description="Prefix for email (before @school_slug)")
    password: str = Field(..., min_length=6)
    
    @validator('email_prefix')
    def validate_email_prefix(cls, v):
        """Ensure email prefix is alphanumeric with dots/underscores only"""
        import re
        if not re.match(r'^[a-zA-Z0-9._]+$', v):
            raise ValueError('Email prefix can only contain letters, numbers, dots, and underscores')
        return v.lower()


# ================= Auth Response Models =================

class AuthTokenData(BaseModel):
    """JWT token data structure"""
    user_id: str
    email: str
    role: str
    database_name: Optional[str] = None
    school_slug: Optional[str] = None
    school_id: Optional[str] = None
    exp: int


class LoginResponse(BaseModel):
    """Login response with token and user info"""
    access_token: str
    token_type: str = "bearer"
    user: GlobalUserResponse


class SchoolCreatedResponse(BaseModel):
    """Response after creating a school with auto-login"""
    school: "SaaSSchoolResponse"
    auth: LoginResponse  # Admin auto-login credentials


# ================= Root User Models (Legacy - Kept for compatibility) =================

class RootUserCreate(BaseModel):
    """Create a root user (super admin)"""
    email: str
    name: str
    password: str


class RootUserInDB(BaseModel):
    """Root user in database"""
    id: Optional[str] = None
    email: str
    name: str
    hashed_password: str
    role: str = "Root"
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class RootUserResponse(BaseModel):
    """Root user response"""
    id: str
    email: str
    name: str
    role: str = "Root"
    is_active: bool
    created_at: datetime


# ================= Billing Models =================

class BillingPeriod(str, Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class BillingConfig(BaseModel):
    """Global billing configuration stored in saas_root_db.billing_config"""
    id: Optional[str] = None
    # MongoDB Atlas Cost Input (manual for free tier, will use Billing API later)
    total_mongo_cost: float = 0.0  # Total MongoDB bill for the period
    billing_period: BillingPeriod = BillingPeriod.MONTHLY
    period_start: datetime
    period_end: datetime
    
    # Fixed cost allocation (equal split for all schools)
    fixed_cpu_ram_cost: float = 0.0  # Total CPU/RAM portion
    
    # Dynamic cost allocation (based on storage)
    dynamic_storage_cost: float = 0.0  # Total storage-based portion
    
    # Markup/Profit settings
    markup_percentage: float = 20.0  # Default 20% markup
    
    # Global miscellaneous amount applied to ALL schools equally
    global_misc_amount: float = 0.0  # e.g., $3 extra per school
    global_misc_description: Optional[str] = None  # Reason for misc charge
    
    # MongoDB Billing API settings (for future paid cluster integration)
    mongo_billing_api_enabled: bool = False  # Whether to fetch from MongoDB Billing API
    mongo_org_id: Optional[str] = None  # MongoDB Atlas Organization ID
    mongo_api_public_key: Optional[str] = None  # For Billing API
    mongo_api_private_key: Optional[str] = None  # For Billing API (encrypted)
    
    created_at: datetime
    updated_at: datetime
    created_by: str  # Root user who created this config


class BillingConfigCreate(BaseModel):
    """Create/Update billing configuration"""
    total_mongo_cost: float = Field(..., ge=0, description="Total MongoDB bill")
    billing_period: BillingPeriod = BillingPeriod.MONTHLY
    period_start: datetime
    period_end: datetime
    fixed_cpu_ram_cost: float = Field(..., ge=0, description="Fixed CPU/RAM cost portion")
    dynamic_storage_cost: float = Field(..., ge=0, description="Dynamic storage cost portion")
    markup_percentage: float = Field(default=20.0, ge=0, le=100)
    # Global miscellaneous charges
    global_misc_amount: float = Field(default=0.0, ge=0, description="Extra amount per school")
    global_misc_description: Optional[str] = Field(default=None, description="Description for misc charge")


class CostBreakdown(BaseModel):
    """Detailed cost breakdown for a school"""
    # Base costs
    fixed_cost: float = 0.0  # Equal share of CPU/RAM
    storage_cost: float = 0.0  # Proportional to storage usage
    base_total: float = 0.0  # fixed_cost + storage_cost
    
    # Markup
    markup_amount: float = 0.0
    subtotal: float = 0.0  # base_total + markup
    
    # Manual adjustments
    misc_charges: float = 0.0
    misc_charges_description: Optional[str] = None
    crash_recovery_charges: float = 0.0
    urgent_recovery_charges: float = 0.0
    discount: float = 0.0
    discount_description: Optional[str] = None
    
    # Final total
    total: float = 0.0


class Invoice(BaseModel):
    """Invoice record stored in saas_root_db.invoices"""
    id: Optional[str] = None
    invoice_number: str  # INV-2024-001 format
    school_id: str
    school_name: str
    database_name: str
    
    # Billing period
    billing_period: BillingPeriod
    period_start: datetime
    period_end: datetime
    
    # Usage stats at time of invoice
    storage_bytes: int = 0
    storage_percentage: float = 0.0  # This school's storage as % of total
    student_count: int = 0
    teacher_count: int = 0
    
    # Cost breakdown
    cost_breakdown: CostBreakdown
    
    # Invoice status
    status: InvoiceStatus = InvoiceStatus.DRAFT
    
    # Editable notes/description
    notes: Optional[str] = None
    internal_notes: Optional[str] = None  # Root user only notes
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    issued_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    
    # Audit
    created_by: str  # Root user who created
    last_modified_by: Optional[str] = None


class InvoiceCreate(BaseModel):
    """Create invoice for a school"""
    school_id: str
    billing_period: BillingPeriod = BillingPeriod.MONTHLY
    period_start: datetime
    period_end: datetime
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    """Update invoice - editable fields before PDF generation"""
    # Manual cost adjustments
    misc_charges: Optional[float] = None
    misc_charges_description: Optional[str] = None
    crash_recovery_charges: Optional[float] = None
    urgent_recovery_charges: Optional[float] = None
    discount: Optional[float] = None
    discount_description: Optional[str] = None
    
    # Status and notes
    status: Optional[InvoiceStatus] = None
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    due_date: Optional[datetime] = None


class InvoiceResponse(BaseModel):
    """Invoice response for API"""
    id: str
    invoice_number: str
    school_id: str
    school_name: str
    billing_period: BillingPeriod
    period_start: datetime
    period_end: datetime
    storage_bytes: int
    storage_percentage: float
    student_count: int
    teacher_count: int
    cost_breakdown: CostBreakdown
    status: InvoiceStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    issued_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    total_amount: float = 0.0


class BulkInvoiceGenerate(BaseModel):
    """Generate invoices for all active schools"""
    billing_period: BillingPeriod = BillingPeriod.MONTHLY
    period_start: datetime
    period_end: datetime
    due_date: Optional[datetime] = None


# ================= Advanced Analytics Models =================

class RevenueAnalytics(BaseModel):
    """Revenue analytics for root dashboard"""
    total_predicted_revenue: float = 0.0
    total_mongo_cost: float = 0.0
    total_profit: float = 0.0
    profit_margin_percentage: float = 0.0
    
    # Per period breakdown
    current_period_revenue: float = 0.0
    previous_period_revenue: float = 0.0
    revenue_growth_percentage: float = 0.0
    
    # By plan type
    revenue_by_plan: dict = {}  # {plan: revenue}
    

class StorageAnalytics(BaseModel):
    """Storage distribution analytics"""
    total_storage_bytes: int = 0
    average_storage_per_school: float = 0.0
    
    # Top schools by storage
    top_schools: List[dict] = []  # [{school_name, storage_bytes, percentage}]
    
    # Distribution data for pie chart
    storage_distribution: List[dict] = []  # [{school_name, storage_bytes}]


class BillingAnalytics(BaseModel):
    """Complete billing analytics response"""
    revenue: RevenueAnalytics
    storage: StorageAnalytics
    
    # Invoice stats
    total_invoices: int = 0
    draft_invoices: int = 0
    pending_invoices: int = 0
    paid_invoices: int = 0
    overdue_invoices: int = 0
    
    # School alerts
    schools_exceeding_storage: List[dict] = []
    schools_exceeding_budget: List[dict] = []


class BillingChangeLog(BaseModel):
    """Audit log for billing changes"""
    id: Optional[str] = None
    entity_type: str  # "invoice", "billing_config", etc.
    entity_id: str
    action: str  # "create", "update", "delete"
    changes: dict  # {field: {old: value, new: value}}
    performed_by: str
    performed_at: datetime
    ip_address: Optional[str] = None
