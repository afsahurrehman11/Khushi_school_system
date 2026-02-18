from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


# ================= Teacher Models =================

class TeacherSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    teacher_id: Optional[str] = None
    cnic: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    assigned_classes: Optional[List[str]] = None  # e.g. ["Grade 7-A"] or class IDs
    assigned_subjects: Optional[List[str]] = None  # Subject IDs
    experience: Optional[str] = None


class TeacherInDB(TeacherSchema):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TeacherCreate(BaseModel):
    school_id: str
    name: str
    cnic: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    assigned_classes: Optional[List[str]] = None
    assigned_subjects: Optional[List[str]] = None


class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    assigned_classes: Optional[List[str]] = None
    assigned_subjects: Optional[List[str]] = None
