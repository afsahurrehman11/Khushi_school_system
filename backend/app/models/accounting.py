"""
Accounting Models for MODULE 2
Session Lifecycle, Ledger System, and Admin Cash Submissions
"""
from datetime import datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field


# ==================== ENUMS ====================

class AccountingSessionStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class TransactionType(str, Enum):
    STUDENT_PAYMENT = "STUDENT_PAYMENT"
    SUBMIT_TO_ADMIN = "SUBMIT_TO_ADMIN"
    ADJUSTMENT = "ADJUSTMENT"


class AdminCashSubmissionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ==================== ACCOUNTING SESSION ====================

class AccountingSessionCreate(BaseModel):
    """Create a new accounting session"""
    opening_balance: float = 0.0
    notes: Optional[str] = None


class AccountingSessionInDB(BaseModel):
    """Accounting session stored in database"""
    id: Optional[str] = None
    school_id: str
    user_id: str
    user_name: str
    role: str
    
    session_date: str  # YYYY-MM-DD
    
    opening_balance: float = 0.0
    closing_balance: Optional[float] = None
    
    total_collected: float = 0.0
    total_submitted_to_admin: float = 0.0
    
    transaction_count: int = 0
    
    status: AccountingSessionStatus = AccountingSessionStatus.OPEN
    
    opened_at: datetime
    closed_at: Optional[datetime] = None
    
    notes: Optional[str] = None


class AccountingSessionClose(BaseModel):
    """Close an accounting session"""
    closing_balance: Optional[float] = None
    notes: Optional[str] = None


class AccountingSessionResponse(BaseModel):
    """Session response with calculated fields"""
    id: str
    school_id: str
    user_id: str
    user_name: str
    role: str
    session_date: str
    opening_balance: float
    closing_balance: Optional[float]
    total_collected: float
    total_submitted_to_admin: float
    outstanding_balance: float  # Calculated: total_collected - total_submitted_to_admin
    transaction_count: int
    status: str
    opened_at: str
    closed_at: Optional[str]
    notes: Optional[str]


# ==================== ACCOUNTANT LEDGER ====================

class LedgerEntryCreate(BaseModel):
    """Create a ledger entry"""
    session_id: str
    transaction_type: TransactionType
    reference_id: str
    debit: float = 0.0
    credit: float = 0.0
    description: str


class LedgerEntryInDB(BaseModel):
    """Ledger entry stored in database"""
    id: Optional[str] = None
    school_id: str
    session_id: str
    user_id: str
    
    transaction_type: TransactionType
    reference_id: str
    
    debit: float = 0.0
    credit: float = 0.0
    balance_after: float = 0.0
    
    description: str
    
    created_at: datetime


class LedgerResponse(BaseModel):
    """Ledger entries response"""
    entries: List[LedgerEntryInDB]
    total_debits: float
    total_credits: float
    current_balance: float


# ==================== ADMIN CASH SUBMISSIONS ====================

class AdminCashSubmissionCreate(BaseModel):
    """Create an admin cash submission request"""
    amount: float
    payment_method: str = "CASH"
    notes: Optional[str] = None


class AdminCashSubmissionInDB(BaseModel):
    """Admin cash submission stored in database"""
    id: Optional[str] = None
    school_id: str
    session_id: str
    
    accountant_id: str
    accountant_name: str
    
    amount: float
    payment_method: str
    
    status: AdminCashSubmissionStatus = AdminCashSubmissionStatus.PENDING
    
    created_at: datetime
    approved_at: Optional[datetime] = None
    
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    rejection_reason: Optional[str] = None


class AdminCashSubmissionApprove(BaseModel):
    """Approve an admin cash submission"""
    pass  # No additional fields needed


class AdminCashSubmissionReject(BaseModel):
    """Reject an admin cash submission"""
    rejection_reason: str


class AdminCashSubmissionResponse(BaseModel):
    """Admin cash submission with session info"""
    id: str
    school_id: str
    session_id: str
    accountant_id: str
    accountant_name: str
    amount: float
    payment_method: str
    status: str
    created_at: str
    approved_at: Optional[str]
    approved_by: Optional[str]
    approved_by_name: Optional[str]
    rejection_reason: Optional[str]


# ==================== ACCOUNTANT BALANCE ====================

class AccountantBalanceResponse(BaseModel):
    """Accountant balance response"""
    collected_today: float
    submitted_to_admin: float
    outstanding_balance: float
    session_id: Optional[str] = None
    session_status: Optional[str] = None
