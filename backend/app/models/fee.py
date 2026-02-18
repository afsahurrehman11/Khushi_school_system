from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# ================= Payment Models =================

class PaymentCreate(BaseModel):
    """Create a payment record"""
    school_id: str  # *** NEW: School isolation ***
    challan_id: str
    student_id: str
    amount_paid: float
    payment_method: str  # cash, online, check, etc.
    transaction_reference: Optional[str] = None
    received_by: str  # User ID who recorded the payment

class PaymentInDB(PaymentCreate):
    """Payment record in database"""
    id: Optional[str] = None
    paid_at: datetime
    created_at: datetime
    payment_status: Optional[str] = None

class PaymentUpdate(BaseModel):
    """Update payment"""
    amount_paid: Optional[float] = None
    payment_method: Optional[str] = None
    transaction_reference: Optional[str] = None

class PaymentResponse(BaseModel):
    """Payment response"""
    id: str
    challan_id: str
    student_id: str
    amount_paid: float
    payment_method: str
    transaction_reference: Optional[str]
    received_by: str
    paid_at: datetime
    created_at: datetime

# ================= Old Fee Models (Deprecated - kept for compatibility) =================

class FeeStructureSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    class_id: str
    academic_year: str
    fee_type: str  # monthly, one-time
    fee_name: str  # e.g. Tuition, Library, Exam
    amount: float
    created_by: str  # User ID
    created_at: datetime
    updated_at: datetime

class FeeStructureInDB(FeeStructureSchema):
    id: Optional[str] = None

class FeeSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    student_id: str
    class_id: str
    fee_structure_id: str
    period: str  # e.g. 2025-02 (YYYY-MM for monthly), or academic year for one-time
    amount: float
    status: str = "pending"  # unpaid, partial, paid
    generated_by: str  # User ID
    created_at: datetime
    updated_at: datetime

class FeeInDB(FeeSchema):
    id: Optional[str] = None
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    remarks: Optional[str] = None

class FeeCreate(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    student_id: str
    class_id: str
    fee_type: str  # tuition, library, sports, exam, etc.
    amount: float
    due_date: str  # YYYY-MM-DD format
    status: str = "pending"  # pending, paid, overdue, cancelled
    generated_by: Optional[str] = None  # User ID who generated the fee

class FeeCreateInDB(FeeCreate):
    id: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    remarks: Optional[str] = None

class FeeUpdate(BaseModel):
    status: Optional[str] = None
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    remarks: Optional[str] = None

class FeeGenerate(BaseModel):
    student_ids: List[str]
    fee_type: str
    amount: float
    due_date: str

# ================= Fee Payment Models =================

class FeePaymentCreate(BaseModel):
    """Create a fee payment record"""
    school_id: str  # *** NEW: School isolation ***
    student_id: str
    class_id: str
    amount_paid: float
    payment_method: str  # cash, bank_transfer, online
    transaction_reference: Optional[str] = None
    remarks: Optional[str] = None

class FeePaymentInDB(FeePaymentCreate):
    """Fee payment record in database"""
    id: Optional[str] = None
    paid_at: datetime
    received_by: str  # User ID who recorded the payment

class FeePaymentUpdate(BaseModel):
    """Update fee payment"""
    amount_paid: Optional[float] = None
    payment_method: Optional[str] = None
    transaction_reference: Optional[str] = None
    remarks: Optional[str] = None

class FeePaymentResponse(BaseModel):
    """Fee payment response"""
    id: str
    student_id: str
    class_id: str
    amount_paid: float
    payment_method: str
    transaction_reference: Optional[str]
    remarks: Optional[str]
    received_by: str
    paid_at: datetime