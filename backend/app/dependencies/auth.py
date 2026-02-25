"""
Authentication Dependencies
Uses saas_root_db.global_users as the ONLY authentication source.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings
from app.models.user import TokenData
from app.services.saas_db import get_global_user_by_email, get_saas_root_db
from typing import Optional
import logging
import os

logger = logging.getLogger(__name__)

# ===== TEMPORARY: Disable RBAC completely for development =====
RBAC_DISABLED = True

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token with proper multi-tenant fields:
    - user_id
    - role
    - database_name (for non-root users)
    - school_slug (for non-root users)
    - school_id (for non-root users)
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """Verify JWT token and extract all fields"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        if email is None:
            return None
        return payload
    except JWTError:
        return None


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Get current authenticated user from global_users.
    This is the ONLY source of truth for user data.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        user_id: str = payload.get("user_id")
        database_name: str = payload.get("database_name")
        school_slug: str = payload.get("school_slug")
        school_id: str = payload.get("school_id")
    except JWTError:
        logger.warning(f"❌ Invalid token")
        raise credentials_exception

    if email is None:
        logger.warning(f"❌ Token missing email")
        raise credentials_exception

    # Get user from global_users (single source of truth)
    user = get_global_user_by_email(email=email)
    if user is None:
        logger.warning(f"❌ User not found in global_users: {email}")
        raise credentials_exception
    
    # Check if user is active
    if not user.get("is_active", True):
        logger.warning(f"❌ User is inactive: {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    # Return complete user context from token + database
    return {
        "id": user.get("id") or user_id,
        "email": email,
        "name": user.get("name"),
        "role": role or user.get("role", "").capitalize(),
        "school_id": school_id or user.get("school_id"),
        "school_slug": school_slug or user.get("school_slug"),
        "database_name": database_name or user.get("database_name"),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    }


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify admin role (Admin or Root)"""
    role = current_user.get("role", "").lower()
    if role not in ["admin", "root"]:
        logger.warning(f"❌ Insufficient permissions for {current_user.get('email')}: role={role}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Root role required"
        )
    return current_user


async def get_current_admin_with_school(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current admin and enforce school isolation"""
    role = current_user.get("role", "").lower()
    if role not in ["admin", "root"]:
        logger.warning(f"❌ Insufficient permissions for {current_user.get('email')}: role={role}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Root role required"
        )
    
    # Non-Root users must have school context
    if role == "admin" and not current_user.get("school_id"):
        logger.error(f"❌ Admin {current_user.get('email')} missing school context")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School context is required for Admin users"
        )
    
    return current_user


async def get_current_root(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify root role"""
    role = current_user.get("role", "").lower()
    if role != "root":
        logger.warning(f"❌ Root access required, but user role is {role}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Root role required"
        )
    return current_user


def check_permission(required_permission: str):
    """Check if user has required permission"""
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        # Short-circuit and allow all actions when RBAC is disabled
        if RBAC_DISABLED:
            logger.info("⚠️ RBAC disabled — allowing all permissions for %s", current_user.get("email"))
            return current_user
        
        # In production, implement proper RBAC here
        return current_user

    return permission_checker


def enforce_school_isolation(required_school_id: Optional[str] = None):
    """
    Enforce strict tenant isolation.
    Non-root users can ONLY access their own school's data.
    """
    async def school_isolation_checker(current_user: dict = Depends(get_current_user)):
        user_school_id = current_user.get("school_id")
        role = current_user.get("role", "").lower()
        
        # Root users bypass school isolation (can access all schools)
        if role == "root":
            return current_user
        
        # Non-Root users MUST have school context
        if not user_school_id:
            logger.error(f"❌ Non-Root user {current_user.get('email')} missing school_id")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School isolation context missing"
            )
        
        # If accessing a specific school, enforce match
        if required_school_id and user_school_id != required_school_id:
            logger.warning(f"❌ TENANT ISOLATION VIOLATION: User {current_user.get('email')} (school {user_school_id}) attempted to access school {required_school_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - you cannot access data from another school"
            )
        
        return current_user
    
    return school_isolation_checker