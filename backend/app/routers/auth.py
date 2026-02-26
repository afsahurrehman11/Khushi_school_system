"""
Centralized Authentication Router
ALL authentication goes through saas_root_db.global_users ONLY.
No database scanning, no multi-DB lookup, no dynamic role detection.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.config import settings
from app.models.user import TokenResponse
from app.dependencies.auth import create_access_token, get_current_user
from app.services.saas_db import get_global_user_by_email, get_saas_root_db
from datetime import timedelta
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def hash_password(password: str) -> str:
    """Hash password using SHA256 (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password


@router.post("/token", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Centralized login endpoint.
    
    AUTHENTICATION FLOW:
    1. Query ONLY saas_root_db.global_users by email
    2. Validate password
    3. If role == "root": Load root dashboard context
    4. If role == "admin" or "staff": Include database_name in JWT
    
    FORBIDDEN:
    - Scanning multiple databases
    - Looping over tenant DBs
    - Email parsing for role detection
    - Guessing user role dynamically
    """
    email = form_data.username.lower().strip()
    password = form_data.password
    
    logger.info(f"🔐 Login attempt for: {email}")
    
    # ============================================
    # SINGLE SOURCE OF TRUTH: global_users ONLY
    # ============================================
    user = get_global_user_by_email(email)
    
    if not user:
        logger.warning(f"❌ Login failed: User not found in global_users - {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password - support both hashed and plain passwords for now
    stored_password_hash = user.get("password_hash")
    stored_password_plain = user.get("password")
    
    password_valid = False
    
    if stored_password_hash:
        # Use hashed password verification
        password_valid = verify_password(password, stored_password_hash)
    elif stored_password_plain:
        # Use plain password comparison (temporary)
        password_valid = password == stored_password_plain
    else:
        logger.warning(f"❌ Login failed: No password field found for user - {email}")
    
    if not password_valid:
        logger.warning(f"❌ Login failed: Invalid password - {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.get("is_active", True):
        logger.warning(f"❌ Login blocked: User inactive - {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    
    role = user.get("role", "").lower()
    school_id = user.get("school_id")
    school_slug = user.get("school_slug")
    database_name = user.get("database_name")
    
    # For non-root users, verify school is active
    if role != "root" and school_id:
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"school_id": school_id})
        
        if not school:
            logger.warning(f"❌ Login blocked: School not found - {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School not found",
            )
        
        if school.get("status") == "suspended":
            logger.warning(f"❌ Login blocked: School suspended - {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School is suspended. Contact administrator.",
            )
        
        if school.get("status") == "deleted":
            logger.warning(f"❌ Login blocked: School deleted - {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School has been deleted.",
            )
    
    # Build JWT with proper structure
    # Role stored as capitalized for frontend compatibility
    display_role = role.capitalize()  # "root" -> "Root", "admin" -> "Admin", "staff" -> "Staff"
    
    token_data = {
        "sub": email,
        "user_id": user.get("id"),
        "role": display_role,
    }
    
    # Add school context for non-root users
    if role != "root":
        if database_name:
            token_data["database_name"] = database_name
        if school_slug:
            token_data["school_slug"] = school_slug
        if school_id:
            token_data["school_id"] = school_id
    
    logger.info(f"✅ Login successful: {email} (Role: {display_role}, DB: {database_name or 'N/A'})")
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data=token_data,
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.get("id"),
            "email": email,
            "name": user.get("name"),
            "role": display_role,
            "school_id": school_id,
            "school_slug": school_slug,
            "database_name": database_name,
            "created_at": user.get("created_at"),
            "is_active": user.get("is_active", True)
        }
    }


@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information from global_users"""
    return {
        "id": current_user.get("id"),
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "role": current_user.get("role"),
        "school_id": current_user.get("school_id"),
        "school_slug": current_user.get("school_slug"),
        "database_name": current_user.get("database_name"),
        "created_at": current_user.get("created_at"),
        "is_active": current_user.get("is_active", True)
    }