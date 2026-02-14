from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


# ================= Teacher Models =================

class TeacherSchema(BaseModel):
    teacher_id: Optional[str] = None
    cnic: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    assigned_classes: List[str] = []  # e.g. ["Grade 7-A"] or class IDs
    assigned_subjects: List[str] = []  # Subject IDs
    experience: Optional[str] = None


class TeacherInDB(TeacherSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TeacherCreate(BaseModel):
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
