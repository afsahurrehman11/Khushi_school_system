from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

# ================= Role & Permission Models =================

class PermissionSchema(BaseModel):
    name: str
    description: str

class RoleSchema(BaseModel):
    name: str
    description: str
    permissions: List[str]  # List of permission names

class RoleInDB(RoleSchema):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# ================= User Models (Multi-School SaaS) =================

class UserSchema(BaseModel):
    email: str
    name: str
    password: str
    school_id: Optional[str] = None  # NULL for Root, set for Admin
    role: str  # "Root", "Admin", "Teacher", "Accountant", etc.

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserInDB(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    password: str  # Plaintext for dev only
    role: str  # "Root", "Admin", "Teacher", "Accountant", etc.
    school_id: Optional[str] = None  # NULL for Root, set for Admin/Teachers
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

class UserResponse(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    role: str
    school_id: Optional[str] = None
    created_at: datetime
    is_active: bool

class RootUserResponse(UserResponse):
    """Response for Root user - can see all schools"""
    pass

class AdminUserResponse(UserResponse):
    """Response for Admin user - linked to one school"""
    school_id: str  # Always required for Admin
    school_name: Optional[str] = None  # Denormalized for convenience

# ================= Authentication Models =================

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

# ================= Admin Panel Models =================

class AdminUserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class AdminRoleCreate(BaseModel):
    name: str
    description: str
    permissions: List[str]

class AdminRoleUpdate(BaseModel):
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

# ================= Accountant Models =================

class AccountantProfile(BaseModel):
    user_id: str
    opening_balance: float = 0.0
    current_balance: float = 0.0
    total_collected: float = 0.0
    last_updated: datetime

class AccountantBalanceUpdate(BaseModel):
    amount: float
    type: str  # 'collection', 'withdrawal', 'adjustment'
    description: str
    recorded_by: str  # User ID who recorded this

class AccountantDailySummary(BaseModel):
    accountant_id: str
    date: str  # YYYY-MM-DD
    opening_balance: float
    collections: Dict[str, float]  # payment_method -> amount
    total_collected: float
    closing_balance: float
    verified: bool = False
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None