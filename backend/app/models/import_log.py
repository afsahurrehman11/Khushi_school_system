from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ImportLogSchema(BaseModel):
    school_id: str  # *** NEW: School isolation ***
    file_name: str
    imported_by: str  # user email
    imported_by_name: str
    timestamp: datetime
    total_rows: int = 0
    successful_rows: int = 0
    failed_rows: int = 0
    duplicate_count: int = 0
    status: str = "processing"  # processing | completed | completed_with_errors | failed
    error_report_id: Optional[str] = None  # GridFS or stored error data
    errors: List[Dict[str, Any]] = []  # list of {row, column, value, reason}
    duplicate_action: str = "skip"  # skip | update


class ImportLogInDB(ImportLogSchema):
    id: Optional[str] = None


class ImportLogResponse(BaseModel):
    id: str
    file_name: str
    imported_by: str
    imported_by_name: str
    timestamp: datetime
    total_rows: int
    successful_rows: int
    failed_rows: int
    duplicate_count: int
    status: str
    errors: List[Dict[str, Any]] = []
    duplicate_action: str = "skip"
