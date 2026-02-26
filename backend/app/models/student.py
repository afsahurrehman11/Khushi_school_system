from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# ================= Student Models =================

class GuardianInfo(BaseModel):
    parent_cnic: Optional[str] = None  # Now optional to allow flexibility
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    guardian_contact: Optional[str] = None
    guardian_email: Optional[str] = None
    address: Optional[str] = None

class ContactInfo(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    emergency_contact: Optional[str] = None

class StudentSchema(BaseModel):
    school_id: str  # School isolation
    student_id: str
    registration_number: Optional[str] = None  # Auto-generated REG-YYYY-#### format
    full_name: str
    gender: str
    date_of_birth: str  # YYYY-MM-DD format
    admission_date: str  # YYYY-MM-DD format
    admission_year: int  # Year of admission
    class_id: str
    section: str
    roll_number: str
    subjects: List[str] = []  # Subject IDs
    assigned_teacher_ids: List[str] = []  # Teacher user IDs
    status: str = "active"  # active, inactive, graduated
    guardian_info: Optional[GuardianInfo] = None
    contact_info: Optional[ContactInfo] = None
    academic_year: str
    # Image fields - stored as base64 blob in MongoDB
    profile_image_blob: Optional[str] = None  # Base64 encoded image
    profile_image_type: Optional[str] = None  # MIME type (image/jpeg, image/png)
    cnic_image_blob: Optional[str] = None  # Optional base64 encoded CNIC image
    cnic_image_type: Optional[str] = None  # MIME type for CNIC
    image_uploaded_at: Optional[datetime] = None
    # Face embedding fields
    face_embedding: Optional[List[float]] = None
    embedding_model: Optional[str] = None
    embedding_generated_at: Optional[datetime] = None
    embedding_status: Optional[str] = None  # "pending", "generated", "failed"
    embedding_version: Optional[str] = None
    face_image_updated_at: Optional[datetime] = None

class StudentInDB(StudentSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    gender: Optional[str] = None
    admission_year: Optional[int] = None
    registration_number: Optional[str] = None  # Allow update of registration number
    class_id: Optional[str] = None
    section: Optional[str] = None
    roll_number: Optional[str] = None
    subjects: Optional[List[str]] = None
    assigned_teacher_ids: Optional[List[str]] = None
    status: Optional[str] = None
    guardian_info: Optional[GuardianInfo] = None
    contact_info: Optional[ContactInfo] = None
    profile_image_blob: Optional[str] = None
    profile_image_type: Optional[str] = None
    cnic_image_blob: Optional[str] = None
    cnic_image_type: Optional[str] = None
    image_uploaded_at: Optional[datetime] = None