from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

# ================= Fee Category Module =================

class FeeComponent(BaseModel):
    """Single fee component (e.g., Tuition, Lab Fee, etc.)"""
    component_name: str
    amount: float

class FeeComponentInDB(FeeComponent):
    id: Optional[str] = None

class FeeComponentUpdate(BaseModel):
    component_name: Optional[str] = None
    amount: Optional[float] = None

class FeeCategory(BaseModel):
    """Fee category with dynamic components"""
    school_id: str  # *** NEW: School isolation ***
    name: str
    description: Optional[str] = None
    components: List[FeeComponent] = []
    is_archived: bool = False

class FeeCategoryInDB(FeeCategory):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

class FeeCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    components: Optional[List[FeeComponent]] = None
    is_archived: Optional[bool] = None

class FeeCategoryResponse(BaseModel):
    """Response model for fee category"""
    id: str
    name: str
    description: Optional[str]
    components: List[Dict[str, Any]]
    total_amount: float
    is_archived: bool
    created_at: datetime
    created_by: Optional[str]

class CategorySnapshot(BaseModel):
    """Snapshot of fee category at time of challan generation"""
    category_id: str
    category_name: str
    components: List[FeeComponent]
    total_amount: float
    snapshot_date: datetime

class CategorySnapshotInDB(CategorySnapshot):
    id: Optional[str] = None
    created_at: datetime

# ================= Class Fee Assignment =================

class ClassFeeAssignment(BaseModel):
    """Assignment of fee category to a class"""
    school_id: str  # *** NEW: School isolation ***
    class_id: str
    category_id: str
    apply_to_existing: Optional[bool] = False

class ClassFeeAssignmentInDB(ClassFeeAssignment):
    id: Optional[str] = None
    assigned_at: datetime
    assigned_by: Optional[str] = None

class ClassFeeAssignmentUpdate(BaseModel):
    category_id: Optional[str] = None
