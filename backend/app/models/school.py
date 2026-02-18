from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime


# ================= School Models =================

class SchoolSchema(BaseModel):
    """Schema for creating a new school"""
    name: str = Field(..., description="School name (lowercased in DB)")
    display_name: Optional[str] = Field(None, description="Display name (first letter capitalized)")
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    
    @validator('name')
    def normalize_name(cls, v):
        """Normalize name to lowercase"""
        if v:
            return v.lower().strip()
        return v
    
    @validator('display_name', always=True)
    def set_display_name(cls, v, values):
        """Set display name from name if not provided"""
        if not v and 'name' in values:
            name = values['name']
            if name:
                return name[0].upper() + name[1:] if len(name) > 1 else name.upper()
        return v


class SchoolInDB(SchoolSchema):
    """School record as stored in database"""
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool = True


class SchoolUpdate(BaseModel):
    """Update school information"""
    name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None


class SchoolResponse(BaseModel):
    """School response model"""
    id: str
    name: str
    display_name: str
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    city: Optional[str]
    is_active: bool
    created_at: datetime
