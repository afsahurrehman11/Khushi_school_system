from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.config import settings
from app.models.user import LoginRequest, TokenResponse
from app.services.user import get_user_by_email
from app.dependencies.auth import create_access_token, get_current_user, get_current_admin
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Login endpoint with multi-tenant SaaS support.
    
    - Root users: Authenticated against saas_root_db, no school context
    - School admins: Authenticated against saas_root_db, includes database_name in token
    - Other users: Authenticated against their school's database
    """
    email = form_data.username.lower().strip()
    password = form_data.password
    
    logger.info(f"🔐 Login attempt for email: {email}")
    
    # First, try to authenticate as a school admin via SaaS system
    try:
        from app.services.saas_service import authenticate_school_admin
        from app.services.saas_db import get_school_database, get_saas_root_db
        
        school = authenticate_school_admin(email, password)
        
        if school:
            # School admin login successful
            school_id = school.get("school_id")
            database_name = school.get("database_name")
            school_name = school.get("school_name")
            
            logger.info(f"✅ School admin login: {email} (School: {school_name}, DB: {database_name})")
            
            access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
            
            # Include database_name in token for dynamic routing
            token_data = {
                "sub": email,
                "role": "Admin",
                "school_id": school_id,
                "database_name": database_name,
            }
            
            access_token = create_access_token(
                data=token_data,
                expires_delta=access_token_expires
            )
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": school.get("id", school_id),
                    "email": email,
                    "name": school_name + " Admin",
                    "role": "Admin",
                    "school_id": school_id,
                    "database_name": database_name,
                    "created_at": school.get("created_at"),
                    "is_active": True
                }
            }
            
    except ValueError as e:
        # School suspended or deleted
        logger.warning(f"❌ Login blocked: {str(e)} - {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
    except Exception as e:
        # SaaS auth failed, try regular auth
        logger.debug(f"SaaS auth not applicable for {email}: {e}")
    
    # Try regular user authentication (Root users or users in default DB)
    user = get_user_by_email(email)
    if not user:
        logger.warning(f"❌ Login failed: User not found - {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # For dev purposes, password is stored in plaintext
    if password != user.get("password"):
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

    role = user.get("role")
    school_id = user.get("school_id")
    
    logger.info(f"✅ Login successful: {email} (Role: {role}, School: {school_id or 'N/A - Root'})")

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    
    # Build token data
    token_data = {"sub": user["email"], "role": role}
    
    if school_id:
        token_data["school_id"] = school_id
        
        # Try to get database_name from saas_root_db for non-Root users
        try:
            from app.services.saas_db import get_school_by_id
            school = get_school_by_id(school_id)
            if school and school.get("database_name"):
                token_data["database_name"] = school.get("database_name")
        except Exception:
            pass
    
    access_token = create_access_token(
        data=token_data,
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": role,
            "school_id": school_id,
            "database_name": token_data.get("database_name"),
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