from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# ================= Class & Subject Models =================

class SubjectSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    # A subject can be assigned to multiple classes/sections with teachers and times
    class Assignment(BaseModel):
        class_name: Optional[str] = None
        section: Optional[str] = None
        teacher_id: Optional[str] = None
        time: Optional[str] = None

    assigned_classes: Optional[List[Assignment]] = None

class SubjectInDB(SubjectSchema):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ClassSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    class_name: Optional[str] = None
    section: Optional[str] = None
    # Each assignment links a subject to an optional teacher and a scheduled time
    class SubjectAssignment(BaseModel):
        subject_id: Optional[str] = None
        teacher_id: Optional[str] = None
        time: Optional[str] = None

    assigned_subjects: Optional[List[SubjectAssignment]] = None
    assigned_teachers: Optional[List[str]] = None  # kept for backward compatibility

class ClassInDB(ClassSchema):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None