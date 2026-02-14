from fastapi import APIRouter, Depends, HTTPException
from typing import List
import logging
from app.models.user import UserResponse, AdminUserCreate, AdminUserUpdate, AdminRoleCreate, AdminRoleUpdate, RoleSchema
from app.services.user import (
    get_all_users, get_user_by_id, create_user, update_user, delete_user,
    get_all_roles, get_role_by_id, create_role, update_role, delete_role
)
from app.services.accountant_service import create_accountant_profile
from app.dependencies.auth import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter()

# User management endpoints
@router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_admin)):
    """Get all users (admin only)"""
    logger.info(f"👥 Fetching users for admin: {current_user.get('email')} (Role: {current_user.get('role')})")
    users = get_all_users()
    logger.info(f"📊 Found {len(users)} total users in database")

    # Filter out root users for non-root admins
    if current_user.get("role") != "Root":
        original_count = len(users)
        users = [user for user in users if user.get("role") != "Root"]
        filtered_count = len(users)
        logger.info(f"🔒 Filtered out {original_count - filtered_count} root users for non-root admin")

    result = [
        {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "created_at": user["created_at"],
            "is_active": user["is_active"]
        }
        for user in users
    ]

    logger.info(f"✅ Returning {len(result)} users to client")
    return result

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Get user by ID (admin only)"""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        "is_active": user["is_active"]
    }

@router.post("/users", response_model=UserResponse)
async def create_new_user(user_data: AdminUserCreate, current_user: dict = Depends(get_current_admin)):
    """Create new user (admin only)"""
    # Check if current user is Admin (not Root)
    if current_user.get("role") == "Admin":
        # Admin can only create users with school roles (not Root)
        school_roles = ["Admin", "Accountant", "Teacher", "Inventory Manager"]
        if user_data.role not in school_roles:
            raise HTTPException(
                status_code=403,
                detail="School Admin can only create users with school roles: Admin, Accountant, Teacher, Inventory Manager"
            )

    user = create_user(
        email=user_data.email,
        name=user_data.name,
        password=user_data.password,
        role=user_data.role
    )
    if not user:
        raise HTTPException(status_code=400, detail="User already exists")

    # Create accountant profile if role is Accountant
    if user_data.role == "Accountant":
        try:
            create_accountant_profile(user["id"])
        except Exception as e:
            logger.warning(f"Failed to create accountant profile for user {user['id']}: {e}")

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        "is_active": user["is_active"]
    }

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: str,
    user_data: AdminUserUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update user (admin only)"""
    update_data = user_data.dict(exclude_unset=True)
    user = update_user(user_id, **update_data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        "is_active": user["is_active"]
    }

@router.delete("/users/{user_id}")
async def delete_existing_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete user (admin only)"""
    # Get the user to be deleted
    user_to_delete = get_user_by_id(user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deletion of Root users
    if user_to_delete.get("role") == "Root":
        raise HTTPException(
            status_code=403,
            detail="Root users cannot be deleted"
        )

    # School Admin cannot delete other Admin users
    if current_user.get("role") == "Admin" and user_to_delete.get("role") == "Admin":
        raise HTTPException(
            status_code=403,
            detail="School Admin cannot delete other Admin users"
        )

    if not delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# Role management endpoints
@router.get("/roles", response_model=List[RoleSchema])
async def get_roles(current_user: dict = Depends(get_current_admin)):
    """Get all roles (admin only)"""
    logger.info(f"📋 Fetching roles for admin: {current_user.get('email')} (Role: {current_user.get('role')})")
    roles = get_all_roles()
    logger.info(f"📊 Found {len(roles)} roles in database")
    return [
        {
            "name": role["name"],
            "description": role["description"],
            "permissions": role["permissions"]
        }
        for role in roles
    ]

@router.post("/roles")
async def create_new_role(role_data: AdminRoleCreate, current_user: dict = Depends(get_current_admin)):
    """Create new role (admin only)"""
    role = create_role(
        name=role_data.name,
        description=role_data.description,
        permissions=role_data.permissions
    )
    if not role:
        raise HTTPException(status_code=400, detail="Role already exists")
    return {"message": "Role created successfully", "role": role}

@router.put("/roles/{role_id}")
async def update_existing_role(
    role_id: str,
    role_data: AdminRoleUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update role (admin only)"""
    update_data = role_data.dict(exclude_unset=True)
    role = update_role(role_id, **update_data)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"message": "Role updated successfully", "role": role}

@router.delete("/roles/{role_id}")
async def delete_existing_role(role_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete role (admin only)"""
    if not delete_role(role_id):
        raise HTTPException(status_code=404, detail="Role not found")
    return {"message": "Role deleted successfully"}