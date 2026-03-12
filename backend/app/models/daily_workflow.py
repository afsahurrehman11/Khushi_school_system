"""
Daily Workflow Models for MODULE 4
Session Closing, Verification, Admin Cash Submissions, and Audit Trail
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


# ==================== ENUMS ====================

class SessionCloseStatus(str, Enum):
    SUCCESS = "SUCCESS"
    DISCREPANCY = "DISCREPANCY"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"


class AdminCashSubmissionStatus(str, Enum):
    """Status for admin cash submission workflow"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

# Backwards compatibility alias
PrincipalPaymentWorkflowStatus = AdminCashSubmissionStatus


# ==================== SESSION CLOSE REQUEST ====================

class CloseSessionWithVerificationRequest(BaseModel):
    """Request to close session with password verification"""
    password: str = Field(..., description="Accountant's password for verification")
    closing_balance: float = Field(..., description="Total closing balance")
    closing_balance_by_method: Dict[str, float] = Field(default_factory=dict, description="Balance by payment method")
    discrepancy_notes: Optional[str] = Field(None, description="Notes explaining any discrepancy")


class PaymentDetailSnapshot(BaseModel):
    """Snapshot of a single payment within the session"""
    payment_id: str
    student_id: str
    student_name: str
    student_class: str
    amount: float
    payment_method: str
    payment_method_id: Optional[str] = None
    timestamp: str
    collector_id: str
    collector_name: str


class ClosedSessionSummary(BaseModel):
    """Summary returned after closing a session"""
    session_id: str
    session_date: str
    accountant_id: str
    accountant_name: str
    
    opening_balance: float
    closing_balance: float
    
    total_collected: float
    total_paid_to_admin: float
    outstanding_balance: float
    
    collection_by_method: Dict[str, float]
    
    payment_count: int
    payments: List[PaymentDetailSnapshot]
    
    discrepancy: float
    discrepancy_notes: Optional[str] = None
    close_status: SessionCloseStatus
    
    closed_at: str
    verified_by: str


# ==================== DAILY SUMMARY ====================

class DailySummaryRequest(BaseModel):
    """Request daily summary for a specific date"""
    date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format, defaults to today")


class DailySummaryPayment(BaseModel):
    """Payment detail in daily summary"""
    payment_id: str
    student_id: str
    student_name: str
    student_class: str
    amount: float
    payment_method: str
    timestamp: str
    fee_type: Optional[str] = None


class DailySummaryResponse(BaseModel):
    """Complete daily summary response"""
    date: str
    accountant_id: str
    accountant_name: str
    
    session_status: str
    session_id: Optional[str] = None
    
    opening_balance: float
    current_balance: float
    
    total_collected_today: float
    total_paid_to_admin_today: float
    outstanding_balance: float
    
    collection_by_method: Dict[str, float]
    collection_by_class: Dict[str, float]
    
    payment_count: int
    payments: List[DailySummaryPayment]
    
    admin_cash_submissions_today: List[Dict[str, Any]]


# ==================== ADMIN CASH SUBMISSION WORKFLOW ====================

class SubmitCashToAdminRequest(BaseModel):
    """Request to submit cash to admin with full workflow"""
    password: str = Field(..., description="Accountant's password for verification")
    amount: float = Field(..., gt=0, description="Payment amount")
    payment_method: str = Field(default="CASH", description="Payment method")
    notes: Optional[str] = Field(None, description="Optional payment notes")
    proof_attachment: Optional[str] = Field(None, description="Attachment URL/reference")

# Backwards compatibility alias
PayPrincipalWorkflowRequest = SubmitCashToAdminRequest


class AdminCashSubmissionRecord(BaseModel):
    """Admin cash submission with full audit trail"""
    id: Optional[str] = None
    school_id: str
    session_id: Optional[str] = None
    
    accountant_id: str
    accountant_name: str
    accountant_email: str
    
    amount: float
    payment_method: str
    notes: Optional[str] = None
    proof_attachment: Optional[str] = None
    
    # Collection details at time of payment
    total_collected_month: float = 0.0
    outstanding_at_request: float = 0.0
    
    status: AdminCashSubmissionStatus = AdminCashSubmissionStatus.PENDING
    
    created_at: datetime
    
    # Approval fields
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_by_email: Optional[str] = None
    
    rejection_reason: Optional[str] = None

# Backwards compatibility alias
PrincipalPaymentWorkflow = AdminCashSubmissionRecord


class ApproveAdminCashSubmissionRequest(BaseModel):
    """Request to approve an admin cash submission"""
    password: str = Field(..., description="Admin's password for verification")

# Backwards compatibility alias
ApprovePrincipalPaymentRequest = ApproveAdminCashSubmissionRequest


class RejectAdminCashSubmissionRequest(BaseModel):
    """Request to reject an admin cash submission"""
    password: str = Field(..., description="Admin's password for verification")
    rejection_reason: str = Field(..., min_length=5, description="Reason for rejection")

# Backwards compatibility alias
RejectPrincipalPaymentRequest = RejectAdminCashSubmissionRequest


class PendingAdminCashSubmissionResponse(BaseModel):
    """Response for pending admin cash submissions list"""
    id: str
    accountant_id: str
    accountant_name: str
    accountant_email: str
    
    amount: float
    payment_method: str
    notes: Optional[str] = None
    
    total_collected_month: float
    outstanding_at_request: float
    
    created_at: str
    status: str


# ==================== ADMIN ACCOUNTANT OVERVIEW ====================

class AccountantDailyOverview(BaseModel):
    """Overview of an accountant's daily activity"""
    accountant_id: str
    accountant_name: str
    accountant_email: str
    
    session_id: Optional[str] = None
    session_status: str
    
    opening_balance: float
    current_balance: float
    closing_balance: Optional[float] = None
    
    total_collected: float
    total_paid_to_admin: float
    outstanding_balance: float
    
    payment_count: int
    
    has_pending_admin_cash_submission: bool
    pending_payment_amount: float


class AllAccountantsDailyResponse(BaseModel):
    """Response with all accountants' daily overview"""
    date: str
    school_id: str
    
    total_collected_school: float
    total_paid_to_admin_school: float
    total_outstanding_school: float
    
    accountants: List[AccountantDailyOverview]


# ==================== AUDIT TRAIL ====================

class DailyAuditEntry(BaseModel):
    """Audit entry for daily workflow actions"""
    id: Optional[str] = None
    school_id: str
    
    action_type: str  # SESSION_OPEN, SESSION_CLOSE, PAYMENT_RECORDED, ADMIN_CASH_SUBMISSION_REQUEST, ADMIN_CASH_SUBMISSION_APPROVED, etc.
    action_description: str
    
    performed_by_id: str
    performed_by_name: str
    performed_by_email: str
    performed_by_role: str
    
    target_type: Optional[str] = None  # session, payment, admin_cash_submission
    target_id: Optional[str] = None
    
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    timestamp: datetime
    ip_address: Optional[str] = None
