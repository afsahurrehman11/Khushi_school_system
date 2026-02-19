"""WhatsApp message log models"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class WhatsAppLogSchema(BaseModel):
    """Schema for WhatsApp message logs"""
    school_id: str
    message: str
    template_type: Optional[str] = None  # fee_reminder, holiday, exam_reminder, attendance_alert, custom
    recipient_type: str  # entire_school, specific_class, specific_section, specific_students
    class_id: Optional[str] = None
    section_id: Optional[str] = None
    student_ids: List[str] = []
    recipient_phones: List[str] = []
    recipients_count: int = 0
    sent_by: str  # User email who initiated
    status: str = "pending"  # pending, sent, failed, scheduled, cancelled
    scheduled_time: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    delivery_report: Optional[dict] = None


class WhatsAppLogInDB(WhatsAppLogSchema):
    """WhatsApp log with database fields"""
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class WhatsAppTemplateSchema(BaseModel):
    """Schema for WhatsApp message templates"""
    school_id: str
    name: str
    type: str  # fee_reminder, holiday, exam_reminder, attendance_alert, custom
    content: str
    variables: List[str] = []  # List of variable placeholders like {student_name}, {amount}
    is_active: bool = True


class WhatsAppTemplateInDB(WhatsAppTemplateSchema):
    """Template with database fields"""
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SendMessageRequest(BaseModel):
    """Request schema for sending WhatsApp messages"""
    message: str
    template_type: Optional[str] = None
    recipient_type: str  # entire_school, specific_class, specific_section, specific_students
    class_id: Optional[str] = None
    section_id: Optional[str] = None
    student_ids: List[str] = []
    schedule_time: Optional[datetime] = None


class WhatsAppStatusResponse(BaseModel):
    """Response schema for WhatsApp connection status"""
    connected: bool
    phone_number: Optional[str] = None
    business_name: Optional[str] = None
    last_checked: datetime
    error: Optional[str] = None
