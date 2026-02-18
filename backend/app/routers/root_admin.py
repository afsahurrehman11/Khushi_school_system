"""
Root User Admin Management Router
Allows Root users to:
- Create, read, update, delete admin accounts
- Link admins to schools
- Manage privileges and roles
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from app.models.user import UserSchema, UserInDB, UserUpdate, AdminUserCreate, AdminUserResponse, RootUserResponse
from app.services.user import (
    get_all_users, get_user_by_email, create_user, update_user, delete_user,
    get_user_by_id
)
from app.services.school import get_school
from app.dependencies.auth import get_current_root
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ================= Root Admin Management =================

@router.post("/admins", response_model=AdminUserResponse, tags=["Root Admin Management"])
async def create_admin_user(
    admin_data: AdminUserCreate,
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Create a new admin user linked to a school (Root only)"""
    try:
        # Verify school exists
        school = get_school(school_id)
        if not school:
            logger.warning(f"[ROOT:{current_user.get('email')}] Cannot create admin for non-existent school: {school_id}")
            raise HTTPException(status_code=404, detail="School not found")
        
        # Check if user already exists
        existing_user = get_user_by_email(admin_data.email)
        if existing_user:
            logger.warning(f"[ROOT:{current_user.get('email')}] Admin creation failed - email exists: {admin_data.email}")
            raise HTTPException(status_code=400, detail="Email already in use")
        
        # Create admin user
        user_doc = {
            "email": admin_data.email,
            "name": admin_data.name,
            "password": admin_data.password,  # In production, hash this
            "role": "Admin",
            "school_id": school_id,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        new_user = create_user(user_doc)
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Created admin: {admin_data.email} for school {school.display_name}")
        
        return {
            "id": new_user.get("id"),
            "email": new_user["email"],
            "name": new_user["name"],
            "role": "Admin",
            "school_id": school_id,
            "school_name": school.display_name,
            "created_at": new_user["created_at"],
            "is_active": True
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to create admin: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admins", response_model=List[AdminUserResponse], tags=["Root Admin Management"])
async def list_admins(
    school_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_root)
):
    """List all admins (optionally filter by school) (Root only)"""
    try:
        filters = {"role": "Admin"}
        if school_id:
            filters["school_id"] = school_id
        if is_active is not None:
            filters["is_active"] = is_active
        
        admins = get_all_users(filters)
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved {len(admins)} admins")
        
        # Enrich with school names
        result = []
        for admin in admins:
            school = get_school(admin.get("school_id")) if admin.get("school_id") else None
            result.append({
                "id": admin.get("id"),
                "email": admin["email"],
                "name": admin["name"],
                "role": "Admin",
                "school_id": admin.get("school_id"),
                "school_name": school.display_name if school else "Unknown",
                "created_at": admin["created_at"],
                "is_active": admin["is_active"]
            })
        
        return result
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to list admins: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admins/{admin_id}", response_model=AdminUserResponse, tags=["Root Admin Management"])
async def get_admin_details(
    admin_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Get admin user details (Root only)"""
    try:
        admin = get_user_by_id(admin_id)
        if not admin or admin.get("role") != "Admin":
            logger.warning(f"[ROOT:{current_user.get('email')}] Admin not found: {admin_id}")
            raise HTTPException(status_code=404, detail="Admin not found")
        
        school = get_school(admin.get("school_id")) if admin.get("school_id") else None
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved admin details: {admin_id}")
        
        return {
            "id": admin.get("id"),
            "email": admin["email"],
            "name": admin["name"],
            "role": "Admin",
            "school_id": admin.get("school_id"),
            "school_name": school.display_name if school else "Unknown",
            "created_at": admin["created_at"],
            "is_active": admin["is_active"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to get admin details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admins/{admin_id}", response_model=AdminUserResponse, tags=["Root Admin Management"])
async def update_admin_user(
    admin_id: str,
    admin_update: UserUpdate,
    current_user: dict = Depends(get_current_root)
):
    """Update admin user (Root only)"""
    try:
        admin = get_user_by_id(admin_id)
        if not admin or admin.get("role") != "Admin":
            logger.warning(f"[ROOT:{current_user.get('email')}] Admin not found: {admin_id}")
            raise HTTPException(status_code=404, detail="Admin not found")
        
        # Update user
        updated_admin = update_user(admin_id, admin_update)
        
        school = get_school(updated_admin.get("school_id")) if updated_admin.get("school_id") else None
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Updated admin: {admin_id}")
        
        return {
            "id": updated_admin.get("id"),
            "email": updated_admin["email"],
            "name": updated_admin["name"],
            "role": "Admin",
            "school_id": updated_admin.get("school_id"),
            "school_name": school.display_name if school else "Unknown",
            "created_at": updated_admin["created_at"],
            "is_active": updated_admin["is_active"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to update admin: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admins/{admin_id}", tags=["Root Admin Management"])
async def delete_admin_user(
    admin_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Delete admin user (deactivate) (Root only)"""
    try:
        admin = get_user_by_id(admin_id)
        if not admin or admin.get("role") != "Admin":
            logger.warning(f"[ROOT:{current_user.get('email')}] Admin not found: {admin_id}")
            raise HTTPException(status_code=404, detail="Admin not found")
        
        # Deactivate admin
        delete_user(admin_id)
        
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Deleted admin: {admin_id}")
        
        return {"message": "Admin deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to delete admin: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me", response_model=RootUserResponse, tags=["Root Admin Management"])
async def get_root_user_info(
    current_user: dict = Depends(get_current_root)
):
    """Get current Root user information"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Fetching user info")
        return {
            "id": current_user.get("id"),
            "email": current_user["email"],
            "name": current_user["name"],
            "role": "Root",
            "school_id": None,
            "created_at": current_user["created_at"],
            "is_active": current_user["is_active"]
        }
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to fetch user info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
