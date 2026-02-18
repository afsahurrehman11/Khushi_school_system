from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime

class CashSessionCreate(BaseModel):
    """Create a new cash session (on login)"""
    opening_balance: float = 0.0
    opening_balance_by_method: Dict[str, float] = Field(default_factory=dict)  # e.g., {"cash": 1000, "HBL Bank": 5000}

class CashSessionUpdate(BaseModel):
    """Update cash session (partial updates)"""
    current_balance: Optional[float] = None
    current_balance_by_method: Optional[Dict[str, float]] = None

class CashSessionClose(BaseModel):
    """Close a cash session (on logout)"""
    closing_balance: float
    closing_balance_by_method: Dict[str, float]  # Accountant-verified amounts
    discrepancy_notes: Optional[str] = None
    verified_by: str

class CashSessionInDB(BaseModel):
    """Cash session in database"""
    id: str
    user_id: str
    school_id: str
    session_date: str  # Date in YYYY-MM-DD format
    opening_balance: float
    opening_balance_by_method: Dict[str, float]
    current_balance: float
    current_balance_by_method: Dict[str, float]  # Updated in real-time as payments come in
    closing_balance: Optional[float] = None
    closing_balance_by_method: Optional[Dict[str, float]] = None
    discrepancy: Optional[float] = None  # Difference between expected and actual
    discrepancy_by_method: Optional[Dict[str, float]] = None
    discrepancy_notes: Optional[str] = None
    status: str  # "active", "closed", "pending_reconciliation"
    started_at: str
    closed_at: Optional[str] = None
    created_at: str
    updated_at: str

class CashTransactionCreate(BaseModel):
    """Record a cash transaction"""
    session_id: str
    payment_id: str  # Link to fee_payment
    student_id: str
    amount: float
    payment_method: str
    transaction_reference: Optional[str] = None

class CashTransactionInDB(BaseModel):
    """Cash transaction in database"""
    id: str
    session_id: str
    user_id: str
    school_id: str
    payment_id: str
    student_id: str
    amount: float
    payment_method: str
    transaction_reference: Optional[str] = None
    timestamp: str
    created_at: str
