from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class ChalanLineItem(BaseModel):
    """Single line item in a chalan"""
    label: str
    amount: float

class ChalanSchema(BaseModel):
    """Schema for creating/updating chalan"""
    school_id: str  # *** NEW: School isolation ***
    student_id: Optional[str] = None
    admission_no: Optional[str] = None
    student_name: Optional[str] = None
    father_name: Optional[str] = None
    class_section: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    line_items: List[ChalanLineItem] = []
    grand_total: Optional[float] = None
    status: Optional[str] = "pending"  # pending, paid, cancelled

class ChalanResponse(BaseModel):
    """Schema for chalan response"""
    id: str
    student_id: Optional[str] = None
    admission_no: Optional[str] = None
    student_name: Optional[str] = None
    father_name: Optional[str] = None
    class_section: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    line_items: List[Dict[str, Any]] = []
    grand_total: float
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
# ================= Enhanced Challan Models (Category-Driven) =================

class ChalanCreate(BaseModel):
    """Create challan from fee category"""
    school_id: str  # *** NEW: School isolation ***
    student_id: str
    class_id: str
    category_id: str  # Fee category to use
    due_date: str  # YYYY-MM-DD format
    issue_date: Optional[str] = None  # YYYY-MM-DD format

class ChalanBulkCreate(BaseModel):
    """Create challans for multiple students"""
    school_id: str  # *** NEW: School isolation ***
    student_ids: List[str]
    class_id: str
    category_id: str
    due_date: str
    issue_date: Optional[str] = None

class ChalanUpdate(BaseModel):
    """Update challan"""
    due_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class ChalanDetailResponse(BaseModel):
    """Detailed challan response"""
    id: str
    student_id: str
    class_id: str
    category_snapshot_id: str
    student_name: str
    student_roll: Optional[str]
    father_name: Optional[str]
    class_section: str
    issue_date: datetime
    due_date: datetime
    line_items: List[dict]
    total_amount: float
    paid_amount: float
    remaining_amount: float
    status: str  # paid, partial, unpaid
    last_payment_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    notes: Optional[str]