from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings
from app.models.user import TokenData
from app.services.user import get_user_by_email
from typing import Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def verify_token(token: str) -> Optional[TokenData]:
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None:
            return None
        token_data = TokenData(email=email, role=role)
    except JWTError:
        return None
    return token_data

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception

    user = get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception

    return user

async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify admin role"""
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


async def get_current_root(current_user: dict = Depends(get_current_user)) -> dict:
    """Get current user and verify root role"""
    if current_user.get("role") != "Root":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user

def check_permission(required_permission: str):
    """Check if user has required permission"""
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        from app.services.user import get_role_by_name

        role_name = current_user.get("role")
        role = get_role_by_name(role_name)

        if not role or required_permission not in role.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user

    return permission_checker