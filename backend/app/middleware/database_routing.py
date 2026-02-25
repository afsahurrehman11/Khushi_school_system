"""
Dynamic Database Routing Middleware
Routes requests to the correct school database based on JWT token.

STRICT TENANT ISOLATION:
- Non-root users can ONLY access their own database
- Database context comes STRICTLY from JWT token
- No ability to override tenant_db from frontend
- Cross-tenant access attempts return 403
"""

from fastapi import Request, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from typing import Optional, Callable
from functools import wraps
from contextvars import ContextVar
import logging

from app.config import settings
from app.services.saas_db import get_school_database, get_saas_root_db
from app.models.saas import SchoolStatus

logger = logging.getLogger(__name__)

# Context variables to store the current database for the request
# These are the ONLY way to access tenant context in routes
current_school_db: ContextVar[Optional[str]] = ContextVar('current_school_db', default=None)
current_school_id: ContextVar[Optional[str]] = ContextVar('current_school_id', default=None)
current_school_slug: ContextVar[Optional[str]] = ContextVar('current_school_slug', default=None)
current_user_role: ContextVar[Optional[str]] = ContextVar('current_user_role', default=None)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_current_database_name() -> Optional[str]:
    """Get the current school's database name from context"""
    return current_school_db.get()


def get_current_school_id() -> Optional[str]:
    """Get the current school ID from context"""
    return current_school_id.get()


def get_current_school_slug() -> Optional[str]:
    """Get the current school slug from context"""
    return current_school_slug.get()


def get_db_for_request():
    """
    Get the database for the current request.
    Uses the database_name from JWT token context STRICTLY.
    
    IMPORTANT: This function enforces tenant isolation.
    Non-root users can ONLY access their assigned database.
    """
    db_name = get_current_database_name()
    role = current_user_role.get()
    
    if db_name:
        return get_school_database(db_name)
    
    # Only root users can fall back to default database
    if role and role.lower() == "root":
        from app.database import get_db
        return get_db()
    
    # Non-root users without database context should fail
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Database context required - tenant isolation enforced"
    )


async def extract_school_context(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Extract school context from JWT token and set context variables.
    Returns decoded token payload.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        
        email = payload.get("sub")
        role = payload.get("role")
        database_name = payload.get("database_name")
        school_id = payload.get("school_id")
        school_slug = payload.get("school_slug")
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing email"
            )
        
        # Set context variables for database routing
        if database_name:
            current_school_db.set(database_name)
        if school_id:
            current_school_id.set(school_id)
        if school_slug:
            current_school_slug.set(school_slug)
        if role:
            current_user_role.set(role)
        
        return payload
        
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def verify_school_access(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Verify that the school in the token is active and accessible.
    Sets up database context for the request.
    
    ENFORCES STRICT TENANT ISOLATION:
    - Root users have access to everything
    - Non-root users MUST have school context
    - School status is verified before access
    """
    payload = await extract_school_context(token)
    
    role = payload.get("role", "").lower()
    school_id = payload.get("school_id")
    database_name = payload.get("database_name")
    
    # Root users have access to everything
    if role == "root":
        return payload
    
    # Non-root users MUST have school context
    if not school_id or not database_name:
        logger.warning(f"Missing school context for user: {payload.get('sub')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School context required for this operation"
        )
    
    # Verify school is active
    root_db = get_saas_root_db()
    school = root_db.schools.find_one({"school_id": school_id})
    
    if not school:
        logger.warning(f"School not found: {school_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School not found"
        )
    
    school_status = school.get("status", "").lower()
    
    if school_status == "suspended":
        logger.warning(f"Access blocked - school suspended: {school_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is suspended. Contact administrator."
        )
    
    if school_status == "deleted":
        logger.warning(f"Access blocked - school deleted: {school_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School has been deleted."
        )
    
    return payload


class SchoolDatabaseDependency:
    """
    Dependency class that provides the correct database based on JWT token.
    Usage in routes:
        db = Depends(SchoolDatabaseDependency())
    
    ENFORCES TENANT ISOLATION:
    - Database comes ONLY from token
    - No ability to specify database from request
    """
    async def __call__(self, token: str = Depends(oauth2_scheme)):
        payload = await verify_school_access(token)
        
        database_name = payload.get("database_name")
        role = payload.get("role", "").lower()
        
        if role == "root":
            # Root users accessing school data need explicit database specification
            # They use the default database or explicitly specify one
            from app.database import get_db
            return get_db()
        
        if database_name:
            return get_school_database(database_name)
        
        # This should never happen due to verify_school_access checks
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Database context required - tenant isolation enforced"
        )


def require_school_context(func: Callable):
    """
    Decorator to require school context for a route.
    Ensures database_name is present in token.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        db_name = get_current_database_name()
        if not db_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="School context required for this operation"
            )
        return await func(*args, **kwargs)
    return wrapper


def school_isolation_check(requested_school_id: str = None):
    """
    Check that the user has access to the requested school.
    Root users can access any school.
    Other users can ONLY access their own school.
    
    HARD REQUIREMENT:
    - Cross-tenant access returns 403
    - No exceptions for any role except root
    """
    async def checker(token: str = Depends(oauth2_scheme)):
        payload = await extract_school_context(token)
        
        role = payload.get("role", "").lower()
        user_school_id = payload.get("school_id")
        
        # Root users bypass isolation
        if role == "root":
            return payload
        
        # STRICT TENANT ISOLATION CHECK
        if requested_school_id and user_school_id != requested_school_id:
            logger.warning(f"🚨 TENANT ISOLATION VIOLATION: user {payload.get('sub')} (school {user_school_id}) tried to access {requested_school_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - you cannot access data from another school"
            )
        
        return payload
    
    return checker


# ================= Middleware Function =================

async def database_routing_middleware(request: Request, call_next):
    """
    Middleware to set up database context for each request.
    Extracts database_name from JWT and makes it available to routes.
    
    STRICT TENANT ISOLATION:
    - Context comes ONLY from JWT token
    - No override possible from request headers or body
    """
    # Skip for public endpoints
    public_paths = ["/", "/health", "/api/token", "/docs", "/openapi.json", "/redoc"]
    if request.url.path in public_paths:
        return await call_next(request)
    
    # Try to extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            
            database_name = payload.get("database_name")
            school_id = payload.get("school_id")
            school_slug = payload.get("school_slug")
            role = payload.get("role")
            
            # Set context variables - these are the ONLY source of tenant info
            if database_name:
                current_school_db.set(database_name)
            if school_id:
                current_school_id.set(school_id)
            if school_slug:
                current_school_slug.set(school_slug)
            if role:
                current_user_role.set(role)
                
        except JWTError:
            # Token invalid, let the route handler deal with it
            pass
    
    # Process the request
    response = await call_next(request)
    
    # Reset context after request
    current_school_db.set(None)
    current_school_id.set(None)
    current_school_slug.set(None)
    current_user_role.set(None)
    
    return response


# ================= Helper Functions =================

def get_user_school_context(payload: dict) -> dict:
    """Extract school context from token payload"""
    return {
        "email": payload.get("sub"),
        "role": payload.get("role"),
        "school_id": payload.get("school_id"),
        "school_slug": payload.get("school_slug"),
        "database_name": payload.get("database_name"),
    }


def create_school_token_data(
    email: str,
    role: str,
    user_id: str = None,
    school_id: Optional[str] = None,
    school_slug: Optional[str] = None,
    database_name: Optional[str] = None
) -> dict:
    """Create token data dict with school context"""
    data = {
        "sub": email,
        "role": role,
    }
    
    if user_id:
        data["user_id"] = user_id
    if school_id:
        data["school_id"] = school_id
    if school_slug:
        data["school_slug"] = school_slug
    if database_name:
        data["database_name"] = database_name
    
    return data
