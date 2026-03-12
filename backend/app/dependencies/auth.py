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

    # Enforce single active session per account.
    # Tokens must contain the session id ('sid') which must match the
    # currently persisted `active_session_id` for the user. If it
    # doesn't match, the token is considered invalid (user logged in
    # elsewhere).
    token_sid = payload.get("sid")
    persisted_sid = user.get("active_session_id")
    if not token_sid or not persisted_sid or token_sid != persisted_sid:
        logger.warning(f"❌ Session mismatch for user {email}: token_sid={token_sid} persisted_sid={persisted_sid}")
        raise credentials_exception

    # Optionally enforce session expiry saved in the DB (fallback if token exp not sufficient)
    session_expires = user.get("session_expires")
    try:
        if session_expires:
            # `session_expires` is expected to be a datetime stored in MongoDB
            if datetime.utcnow() > session_expires:
                logger.warning(f"❌ Session expired for user {email}")
                raise credentials_exception
    except Exception:
        # If any error occurs while validating session expiry, treat token as invalid
        logger.warning(f"⚠️ Could not validate session expiry for {email}")
        raise credentials_exception

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


def require_role(allowed_roles: list):
    """
    Dependency factory that creates a role validator.
    Usage: current_user: dict = Depends(require_role(["Admin", "Root"]))
    """
    async def role_validator(current_user: dict = Depends(get_current_user)) -> dict:
        # Normalize role comparison (case-insensitive)
        user_role = current_user.get("role", "").lower()
        allowed_roles_lower = [role.lower() for role in allowed_roles]
        
        if user_role not in allowed_roles_lower:
            logger.warning(f"❌ Insufficient permissions for {current_user.get('email')}: role={user_role}, required={allowed_roles}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of the following roles is required: {', '.join(allowed_roles)}"
            )
        return current_user
    
    return role_validator


def check_permission(required_permission: str):
    """Check if user has required permission"""
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        # Short-circuit and allow all actions when RBAC is disabled
        if RBAC_DISABLED:
            # RBAC is intentionally disabled in development.
            # Do not emit noisy console messages here to keep logs clean during local development.
            return current_user
        
        # In production, implement proper RBAC here
        return current_user

    return permission_checker


def enforce_school_isolation(required_school_id: Optional[str] = None):
    """
    School isolation enforcement - DISABLED for development.
    All users can access all school data.
    """
    async def school_isolation_checker(current_user: dict = Depends(get_current_user)):
        # School isolation is disabled - allow all access
        return current_user
    
    return school_isolation_checker