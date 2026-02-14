from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.config import settings
from app.models.user import LoginRequest, TokenResponse
from app.services.user import get_user_by_email
from app.dependencies.auth import create_access_token, get_current_user, get_current_admin
from datetime import timedelta

router = APIRouter()

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
import logging
from app.config import settings
from app.models.user import LoginRequest, TokenResponse
from app.services.user import get_user_by_email
from app.dependencies.auth import create_access_token, get_current_user, get_current_admin
from datetime import timedelta

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/token", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint"""
    logger.info(f"🔐 Login attempt for email: {form_data.username}")
    user = get_user_by_email(form_data.username)
    if not user:
        logger.warning(f"❌ Login failed: User not found - {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # For dev purposes, password is stored in plaintext
    if form_data.password != user.get("password"):
        logger.warning(f"❌ Login failed: Invalid password - {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(f"✅ Login successful for user: {form_data.username} (Role: {user.get('role')})")

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user["email"], "role": user["role"]},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "created_at": user["created_at"],
            "is_active": user["is_active"]
        }
    }

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"],
        "created_at": current_user["created_at"],
        "is_active": current_user["is_active"]
    }