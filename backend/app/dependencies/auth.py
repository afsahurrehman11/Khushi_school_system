from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings
from app.models.user import TokenData
from app.services.user import get_user_by_email
from typing import Optional
import logging

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token with schoolId included for non-Root users"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def verify_token(token: str) -> Optional[TokenData]:
    """Verify JWT token and extract schoolId"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        school_id: Optional[str] = payload.get("school_id")  # Extract schoolId
        if email is None:
            return None
        token_data = TokenData(email=email, role=role)
    except JWTError:
        return None
    return token_data

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current authenticated user with schoolId context"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Verify token to extract schoolId
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        school_id: Optional[str] = payload.get("school_id")
    except JWTError:
        logger.warning(f"❌ Invalid token")
        raise credentials_exception

    if email is None:
        logger.warning(f"❌ Token missing email")
        raise credentials_exception

    user = get_user_by_email(email=email)
    if user is None:
        logger.warning(f"❌ User not found: {email}")
        raise credentials_exception

    # Inject schoolId from token into user dict
    user["school_id_context"] = school_id

    return user

async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify admin role (Admin or Root)"""
    role = current_user.get("role")
    if role not in ["Admin", "Root"]:
        logger.warning(f"❌ Insufficient permissions for {current_user.get('email')}: role={role}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Root role required"
        )
    return current_user

async def get_current_admin_with_school(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current admin and enforce school isolation"""
    role = current_user.get("role")
    if role not in ["Admin", "Root"]:
        logger.warning(f"❌ Insufficient permissions for {current_user.get('email')}: role={role}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Root role required"
        )
    
    # Non-Root users must have a schoolId
    if role == "Admin" and not current_user.get("school_id"):
        logger.error(f"❌ Admin {current_user.get('email')} missing school_id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School ID is required for Admin users"
        )
    
    return current_user

async def get_current_root(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify root role"""
    if current_user.get("role") != "Root":
        logger.warning(f"❌ Root access required, but user role is {current_user.get('role')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Root role required"
        )
    return current_user

def check_permission(required_permission: str):
    """Check if user has required permission"""
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        from app.services.user import get_role_by_name

        role_name = current_user.get("role")
        role = get_role_by_name(role_name)

        if not role or required_permission not in role.get("permissions", []):
            logger.warning(f"❌ User {current_user.get('email')} lacks permission: {required_permission}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user

    return permission_checker

def enforce_school_isolation(required_school_id: Optional[str] = None):
    """Middleware to enforceSchoolId in requests"""
    async def school_isolation_checker(current_user: dict = Depends(get_current_user)):
        user_school_id = current_user.get("school_id")
        
        # Root users can bypass school isolation
        if current_user.get("role") == "Root":
            return current_user
        
        # Non-Root users must have schoolId in token
        if not user_school_id:
            logger.error(f"❌ Non-Root user {current_user.get('email')} missing school_id")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School isolation context missing"
            )
        
        # If a specific schoolId is required, enforce it
        if required_school_id and user_school_id != required_school_id:
            logger.warning(f"❌ User {current_user.get('email')} attempted to access school {required_school_id} but belonged to {user_school_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - school mismatch"
            )
        
        return current_user
    
    return school_isolation_checker