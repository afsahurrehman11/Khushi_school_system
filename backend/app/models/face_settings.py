"""
Face Recognition Settings Model
Stores school-specific settings for face recognition attendance
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FaceSettingsSchema(BaseModel):
    school_id: str
    # Student settings
    school_start_time: str = "08:00"  # HH:MM format
    late_after_time: str = "08:30"  # Mark late after this time
    auto_absent_time: str = "09:00"  # Mark absent after this time
    # Employee settings
    employee_checkin_time: str = "08:00"  # Expected check-in time
    employee_late_after: str = "08:30"  # Late after this time
    employee_checkout_time: str = "17:00"  # Required check-out time
    # Recognition settings
    confidence_threshold: float = 0.85  # Minimum confidence to accept
    max_retry_attempts: int = 5  # Maximum auto retry attempts
    # Enabled flags
    students_enabled: bool = True
    employees_enabled: bool = True


class FaceSettingsInDB(FaceSettingsSchema):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FaceSettingsUpdate(BaseModel):
    school_start_time: Optional[str] = None
    late_after_time: Optional[str] = None
    auto_absent_time: Optional[str] = None
    employee_checkin_time: Optional[str] = None
    employee_late_after: Optional[str] = None
    employee_checkout_time: Optional[str] = None
    confidence_threshold: Optional[float] = None
    max_retry_attempts: Optional[int] = None
    students_enabled: Optional[bool] = None
    employees_enabled: Optional[bool] = None


# Activity log for dashboard
class FaceActivityLog(BaseModel):
    school_id: str
    person_type: str  # "student" | "employee"
    person_id: str
    person_name: str
    action: str  # "present" | "late" | "check_in" | "check_out"
    confidence: float
    timestamp: datetime
    class_id: Optional[str] = None
    section: Optional[str] = None


class FaceActivityLogInDB(FaceActivityLog):
    id: Optional[str] = None
