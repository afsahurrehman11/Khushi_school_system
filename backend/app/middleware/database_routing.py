"""
Dynamic Database Routing Middleware
Routes requests to the correct school database based on JWT token
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

# Context variable to store the current database for the request
current_school_db: ContextVar[Optional[str]] = ContextVar('current_school_db', default=None)
current_school_id: ContextVar[Optional[str]] = ContextVar('current_school_id', default=None)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_current_database_name() -> Optional[str]:
    """Get the current school's database name from context"""
    return current_school_db.get()


def get_current_school_id() -> Optional[str]:
    """Get the current school ID from context"""
    return current_school_id.get()


def get_db_for_request():
    """
    Get the database for the current request.
    Uses the database_name from JWT token context.
    Falls back to default database if not in school context.
    """
    db_name = get_current_database_name()
    if db_name:
        return get_school_database(db_name)
    
    # Fallback to original database for backward compatibility
    from app.database import get_db
    return get_db()


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
    """
    payload = await extract_school_context(token)
    
    role = payload.get("role")
    school_id = payload.get("school_id")
    database_name = payload.get("database_name")
    
    # Root users have access to everything
    if role == "Root":
        return payload
    
    # Non-root users must have school context
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
    
    if school.get("status") == SchoolStatus.SUSPENDED.value:
        logger.warning(f"Access blocked - school suspended: {school_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is suspended. Contact administrator."
        )
    
    if school.get("status") == SchoolStatus.DELETED.value:
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
    """
    async def __call__(self, token: str = Depends(oauth2_scheme)):
        payload = await verify_school_access(token)
        
        database_name = payload.get("database_name")
        role = payload.get("role")
        
        if role == "Root":
            # Root users accessing school data need explicit database specification
            # They use the default database or explicitly specify one
            from app.database import get_db
            return get_db()
        
        if database_name:
            return get_school_database(database_name)
        
        # Fallback
        from app.database import get_db
        return get_db()


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
    Other users can only access their own school.
    """
    async def checker(token: str = Depends(oauth2_scheme)):
        payload = await extract_school_context(token)
        
        role = payload.get("role")
        user_school_id = payload.get("school_id")
        
        # Root users bypass isolation
        if role == "Root":
            return payload
        
        # Check school match
        if requested_school_id and user_school_id != requested_school_id:
            logger.warning(f"School isolation violation: user {payload.get('sub')} tried to access {requested_school_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access data from another school"
            )
        
        return payload
    
    return checker


# ================= Middleware Function =================

async def database_routing_middleware(request: Request, call_next):
    """
    Middleware to set up database context for each request.
    Extracts database_name from JWT and makes it available to routes.
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
            
            # Set context variables
            if database_name:
                current_school_db.set(database_name)
            if school_id:
                current_school_id.set(school_id)
                
        except JWTError:
            # Token invalid, let the route handler deal with it
            pass
    
    # Process the request
    response = await call_next(request)
    
    # Reset context
    current_school_db.set(None)
    current_school_id.set(None)
    
    return response


# ================= Helper Functions =================

def get_user_school_context(payload: dict) -> dict:
    """Extract school context from token payload"""
    return {
        "email": payload.get("sub"),
        "role": payload.get("role"),
        "school_id": payload.get("school_id"),
        "database_name": payload.get("database_name"),
    }


def create_school_token_data(
    email: str,
    role: str,
    school_id: Optional[str] = None,
    database_name: Optional[str] = None
) -> dict:
    """Create token data dict with school context"""
    data = {
        "sub": email,
        "role": role,
    }
    
    if school_id:
        data["school_id"] = school_id
    if database_name:
        data["database_name"] = database_name
    
    return data
