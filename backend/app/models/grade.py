from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ================= Grade Models =================

class GradeSchema(BaseModel):
    student_id: str
    subject_id: str
    class_id: Optional[str] = None
    teacher_id: str
    total_marks: float
    obtained_marks: float
    percentage: Optional[float] = None
    remarks: Optional[str] = None
    exam_type: Optional[str] = None  # e.g. midterm, final, quiz
    date_recorded: Optional[datetime] = None


class GradeInDB(GradeSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class GradeUpdate(BaseModel):
    total_marks: Optional[float] = None
    obtained_marks: Optional[float] = None
    percentage: Optional[float] = None
    remarks: Optional[str] = None
