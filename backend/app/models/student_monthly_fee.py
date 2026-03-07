from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

# ================= Fee Status Enum =================

class FeeStatus(str, Enum):
    PAID = "PAID"
    PARTIAL = "PARTIAL"
    UNPAID = "UNPAID"
    OVERDUE = "OVERDUE"

# ================= Student Monthly Fee Models =================

class StudentMonthlyFeeCreate(BaseModel):
    """Create a monthly fee record for a student"""
    school_id: str
    student_id: str
    month: int  # 1-12
    year: int  # e.g., 2026
    base_fee: float  # Total fee before discounts
    scholarship_percent: float = 0.0  # Scholarship % at time of fee generation
    scholarship_amount: float = 0.0  # Calculated discount amount
    fee_after_discount: float  # base_fee - scholarship_amount
    arrears_added: float = 0.0  # Arrears carried forward from previous month
    arrears_carried: bool = False  # Whether previous months' arrears have been carried into this record
    final_fee: float  # fee_after_discount + arrears_added
    amount_paid: float = 0.0
    remaining_amount: float  # final_fee - amount_paid
    status: FeeStatus = FeeStatus.UNPAID
    
    @validator('month')
    def validate_month(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Month must be between 1 and 12")
        return v
    
    @validator('scholarship_percent')
    def validate_scholarship(cls, v):
        if not 0 <= v <= 100:
            raise ValueError("Scholarship percent must be between 0 and 100")
        return v

class StudentMonthlyFeeInDB(StudentMonthlyFeeCreate):
    """Monthly fee record stored in database"""
    id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    generated_by: Optional[str] = None  # User ID who generated the fee

class StudentMonthlyFeeUpdate(BaseModel):
    """Update monthly fee record"""
    amount_paid: Optional[float] = None
    remaining_amount: Optional[float] = None
    status: Optional[FeeStatus] = None
    updated_at: Optional[datetime] = None

class StudentMonthlyFeeResponse(BaseModel):
    """Response model for monthly fee"""
    id: str
    school_id: str
    student_id: str
    month: int
    year: int
    month_name: Optional[str] = None  # Computed field for display
    base_fee: float
    scholarship_percent: float
    scholarship_amount: float
    fee_after_discount: float
    arrears_added: float
    arrears_carried: bool = False
    final_fee: float
    amount_paid: float
    remaining_amount: float
    status: FeeStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        use_enum_values = True

class MonthlyFeeBreakdown(BaseModel):
    """Detailed fee breakdown for a single month"""
    month: int
    year: int
    month_name: str
    base_fee: float
    scholarship_percent: float
    scholarship_amount: float
    fee_after_discount: float
    arrears_added: float
    final_fee: float
    amount_paid: float
    remaining_amount: float
    status: str
    payments: List["StudentPaymentResponse"] = []

class MonthlyFeeSummary(BaseModel):
    """Summary of monthly fees for analytics"""
    total_months: int
    paid_months: int
    partial_months: int
    unpaid_months: int
    overdue_months: int
    total_fees_generated: float
    total_paid: float
    total_remaining: float
    total_scholarship_given: float

# ================= Payment Models =================

class PaymentMethod(str, Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    ONLINE = "ONLINE"
    CHEQUE = "CHEQUE"
    CARD = "CARD"
    OTHER = "OTHER"

class StudentPaymentCreate(BaseModel):
    """Create a payment record"""
    school_id: str
    student_id: str
    monthly_fee_id: str  # Reference to student_monthly_fees collection
    amount: float
    payment_method: PaymentMethod = PaymentMethod.CASH
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    received_by: Optional[str] = None  # User ID who received payment
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Payment amount must be greater than 0")
        return v

class StudentPaymentInDB(StudentPaymentCreate):
    """Payment record stored in database"""
    id: Optional[str] = None
    created_at: datetime
    payment_date: datetime  # When payment was made

class StudentPaymentUpdate(BaseModel):
    """Update payment record"""
    amount: Optional[float] = None
    payment_method: Optional[PaymentMethod] = None
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class StudentPaymentResponse(BaseModel):
    """Response model for payment"""
    id: str
    school_id: str
    student_id: str
    monthly_fee_id: str
    amount: float
    payment_method: str
    transaction_reference: Optional[str]
    notes: Optional[str]
    received_by: Optional[str]
    payment_date: datetime
    created_at: datetime
    # Extra fields for display
    month: Optional[int] = None
    year: Optional[int] = None
    month_name: Optional[str] = None

class PaymentSummary(BaseModel):
    """Payment summary for a student"""
    total_payments: int
    total_amount_paid: float
    payments_by_method: dict  # {"CASH": 5000, "ONLINE": 3000}
    recent_payments: List[StudentPaymentResponse] = []

# Forward reference update: prefer Pydantic v2 `model_rebuild`, fall back to v1 `update_forward_refs`
try:
    MonthlyFeeBreakdown.model_rebuild()
except AttributeError:
    try:
        MonthlyFeeBreakdown.update_forward_refs()
    except Exception:
        # If neither method exists, we silently continue; models may still work depending on usage
        pass
