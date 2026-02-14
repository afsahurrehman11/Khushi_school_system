from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# ================= Class & Subject Models =================

class SubjectSchema(BaseModel):
    subject_name: str
    subject_code: Optional[str] = None
    # A subject can be assigned to multiple classes/sections with teachers and times
    class Assignment(BaseModel):
        class_name: str
        section: Optional[str] = None
        teacher_id: Optional[str] = None
        time: Optional[str] = None

    assigned_classes: List[Assignment] = []

class SubjectInDB(SubjectSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ClassSchema(BaseModel):
    class_name: str
    section: Optional[str] = None
    # Each assignment links a subject to an optional teacher and a scheduled time
    class SubjectAssignment(BaseModel):
        subject_id: str
        teacher_id: Optional[str] = None
        time: Optional[str] = None

    assigned_subjects: List[SubjectAssignment] = []
    assigned_teachers: List[str] = []  # kept for backward compatibility

class ClassInDB(ClassSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime