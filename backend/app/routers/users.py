from fastapi import APIRouter, Depends, HTTPException
from typing import List
import logging
import hashlib
from app.models.user import UserResponse, AdminUserCreate, AdminUserUpdate, AdminRoleCreate, AdminRoleUpdate, RoleSchema
from app.services.user import (
    get_all_users, get_user_by_id, update_user, delete_user,
    get_all_roles, get_role_by_id, create_role, update_role, delete_role
)
from app.services.saas_db import (
    create_global_user, get_global_users_by_school, get_saas_root_db,
    get_global_user_by_email
)
from app.services.accountant_service import create_accountant_profile
from app.dependencies.auth import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter()

# User management endpoints
@router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_admin)):
    """Get all users (admin only) - fetches from global_users by school"""
    school_id = current_user.get("school_id")
    role = current_user.get("role")
    
    logger.info(f"👥 Fetching users for admin: {current_user.get('email')} (Role: {role})")
    
    # Root users see all users (fallback to old method)
    if role == "Root":
        users = get_all_users()
    else:
        # School admins see only their school's users from global_users
        if not school_id:
            logger.error(f"❌ School admin {current_user.get('email')} has no school_id")
            return []
        users = get_global_users_by_school(school_id)
    
    logger.info(f"📊 Found {len(users)} total users")

    # Filter out root users for non-root admins
    if role != "Root":
        original_count = len(users)
        users = [user for user in users if user.get("role", "").lower() != "root"]
        filtered_count = len(users)
        logger.info(f"🔒 Filtered out {original_count - filtered_count} root users for non-root admin")

    result = [
        {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role", "Staff"),
            "created_at": user.get("created_at"),
            "is_active": user.get("is_active", True),
            "school_id": user.get("school_id")
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
    """Create new user in global_users (admin only)"""
    school_id = current_user.get("school_id")
    school_slug = current_user.get("school_slug")
    database_name = current_user.get("database_name")
    role = current_user.get("role")
    
    logger.info(f"👤 Creating user: {user_data.email} by {current_user.get('email')} (School: {school_id})")
    
    # Check if current user is Admin (not Root)
    if role == "Admin":
        # Admin can only create users with school roles (not Root)
        school_roles = ["Admin", "Accountant", "Teacher", "Inventory Manager"]
        if user_data.role not in school_roles:
            raise HTTPException(
                status_code=403,
                detail="School Admin can only create users with school roles: Admin, Accountant, Teacher, Inventory Manager"
            )
        
        # Ensure Admin has school context
        if not school_id or not school_slug or not database_name:
            logger.error(f"❌ Admin {current_user.get('email')} missing school context")
            raise HTTPException(
                status_code=403,
                detail="School admin must be properly configured with school context"
            )
        
        # Get school name from database
        root_db = get_saas_root_db()
        school = root_db.schools.find_one({"school_id": school_id})
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        
        school_name = school.get("school_slug") or school.get("display_name", "school").lower().replace(" ", "")
        
        # Auto-append school name to email if not present
        email_input = user_data.email.strip().lower()
        if "@" not in email_input:
            # Only username provided - append @schoolname
            full_email = f"{email_input}@{school_name}"
        elif email_input.endswith("@"):
            # Username@ provided - append schoolname
            full_email = f"{email_input}{school_name}"
        else:
            # Full email provided - use as is
            full_email = email_input
        
        logger.info(f"📧 Constructed email: {full_email} (from input: {email_input})")
    else:
        # Root user creating users
        full_email = user_data.email.strip().lower()
    
    # Hash password
    password_hash = hashlib.sha256(user_data.password.encode()).hexdigest()
    
    # Create user in global_users
    user = create_global_user({
        "email": full_email,
        "name": user_data.name,
        "password_hash": password_hash,
        "role": user_data.role.lower(),  # Store as lowercase
        "school_id": school_id if role == "Admin" else None,
        "school_slug": school_slug if role == "Admin" else None,
        "database_name": database_name if role == "Admin" else None,
        "is_active": True
    })
    
    if not user:
        logger.error(f"❌ User creation failed for {full_email}")
        raise HTTPException(status_code=400, detail="User already exists or creation failed")

    logger.info(f"✅ User created: {full_email} (Role: {user_data.role})")

    # Create accountant profile if role is Accountant
    if user_data.role == "Accountant":
        try:
            create_accountant_profile(user["id"])
            logger.info(f"✅ Accountant profile created for {user['id']}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to create accountant profile for user {user['id']}: {e}")

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user_data.role,  # Return capitalized for frontend
        "created_at": user["created_at"],
        "is_active": user["is_active"],
        "school_id": user.get("school_id")
    }

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: str,
    user_data: AdminUserUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update user (admin only)"""
    # Hash password if included in update
    update_data = user_data.dict(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        update_data["password_hash"] = hashlib.sha256(update_data["password"].encode()).hexdigest()
        del update_data["password"]
    
    user = update_global_user(user_id, update_data)
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
    user_to_delete = get_global_user_by_id(user_id)
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

    if not delete_global_user(user_id, hard_delete=False):
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