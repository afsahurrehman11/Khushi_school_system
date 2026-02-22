"""
SaaS Multi-Tenant Models
Models for the root SaaS database (saas_root_db)
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


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


# ================= Root User Models =================

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
    # MongoDB Atlas Cost Input (manual for free tier)
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
