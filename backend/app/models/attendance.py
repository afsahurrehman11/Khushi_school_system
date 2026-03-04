from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# ================= Attendance Models =================

class AttendanceSchema(BaseModel):
    school_id: str
    class_id: str
    student_id: str
    date: str  # YYYY-MM-DD format
    status: str  # "present" | "absent" | "late"
    source: str = "manual"  # "manual" | "face"
    check_in_time: Optional[str] = None  # HH:MM format - when student arrived
    check_out_time: Optional[str] = None  # HH:MM format - when student left
    confidence: Optional[float] = None  # For face recognition, optional
    notes: Optional[str] = None


class AttendanceInDB(AttendanceSchema):
    id: Optional[str] = None
    scan_time: Optional[str] = None  # Backward compatibility
    created_at: datetime
    updated_at: datetime


class AttendanceUpdate(BaseModel):
    status: str  # "present" | "absent" | "late"
    source: Optional[str] = "manual"
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None


class AttendanceResponse(BaseModel):
    id: str
    school_id: str
    class_id: str
    student_id: str
    date: str
    status: str
    source: str
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AttendanceSummary(BaseModel):
    date: str
    total_students: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
