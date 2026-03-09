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
from datetime import datetime, timedelta
import uuid
import hashlib
import logging
import time
import threading

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
    start_time = time.monotonic()
    
    # ============================================
    # SINGLE SOURCE OF TRUTH: global_users ONLY
    # ============================================
    db_lookup_start = time.monotonic()
    user = get_global_user_by_email(email)
    logger.debug(f"db: get_global_user_by_email took {time.monotonic() - db_lookup_start:.3f}s")
    
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
        # Prefer denormalized school status on the user document (fast).
        school_status = user.get("school_status")
        if school_status:
            if school_status == "suspended":
                logger.warning(f"❌ Login blocked: School suspended (denormalized) - {email}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="School is suspended. Contact administrator.",
                )
            if school_status == "deleted":
                logger.warning(f"❌ Login blocked: School deleted (denormalized) - {email}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="School has been deleted.",
                )
        else:
            # Fall back to a very small projection lookup to confirm school status.
            school_lookup_start = time.monotonic()
            root_db = get_saas_root_db()
            school = root_db.schools.find_one({"school_id": school_id}, {"status": 1, "database_name": 1, "school_slug": 1})
            logger.debug(f"db: schools.find_one (proj) took {time.monotonic() - school_lookup_start:.3f}s")

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

            # Optionally write the small denormalized value back to global_users in background
            def _denormalize_school(email_local, sid):
                try:
                    db = get_saas_root_db()
                    db.global_users.update_one(
                        {"email": email_local},
                        {"$set": {"school_status": school.get("status"),
                                  "database_name": school.get("database_name", database_name),
                                  "school_slug": school.get("school_slug", school_slug)}}
                    )
                    logger.debug(f"db: denormalized school for {email_local}")
                except Exception as e:
                    logger.warning(f"⚠️ Could not denormalize school for {email_local}: {e}")

            try:
                threading.Thread(target=_denormalize_school, args=(email, school_id), daemon=True).start()
            except Exception:
                pass
    
    # Build JWT with proper structure
    # Role stored as capitalized for frontend compatibility
    display_role = role.capitalize()  # "root" -> "Root", "admin" -> "Admin", "staff" -> "Staff"
    
    # Create a new single-use session id for this login. Storing this
    # session id in the global_users document allows us to enforce
    # a single active session per account: issuing a new session will
    # invalidate any previous tokens.
    session_id = str(uuid.uuid4())

    token_data = {
        "sub": email,
        "user_id": user.get("id"),
        "role": display_role,
        "sid": session_id,
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
    # Persist the active session id and expiry in the global_users collection
    # Persist session in background so login API is not blocked on a sync DB write.
    def _persist_session(email_local, sid, expires):
        try:
            db_start = time.monotonic()
            root_db = get_saas_root_db()
            root_db.global_users.update_one(
                {"email": email_local},
                {"$set": {
                    "active_session_id": sid,
                    "session_expires": datetime.utcnow() + expires
                }}
            )
            logger.debug(f"db: global_users.update_one (persist session) took {time.monotonic() - db_start:.3f}s")
        except Exception as e:
            logger.warning(f"⚠️ Could not persist active session for {email_local}: {e}")

    try:
        t = threading.Thread(target=_persist_session, args=(email, session_id, access_token_expires), daemon=True)
        t.start()
    except Exception as e:
        logger.warning(f"⚠️ Failed to start background session persistence for {email}: {e}")
    logger.debug(f"total_login_time so far: {time.monotonic() - start_time:.3f}s")
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


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Invalidate the current user's active session (logout).

    This clears the persisted `active_session_id` and `session_expires`
    fields stored in `saas_root_db.global_users` for the authenticated user.
    """
    email = current_user.get("email")
    try:
        root_db = get_saas_root_db()
        # Unset the active session fields
        root_db.global_users.update_one(
            {"email": email},
            {"$unset": {"active_session_id": "", "session_expires": ""}}
        )
    except Exception as e:
        logger.warning(f"⚠️ Could not clear active session for {email}: {e}")

    return {"detail": "Logged out"}