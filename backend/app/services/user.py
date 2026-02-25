from app.database import get_db
from app.models.user import UserInDB, RoleSchema
from datetime import datetime
from typing import Optional, Dict
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= User Operations =================

def create_user(user_data: Dict) -> Optional[dict]:
    """Create a new user with plaintext password (dev only)
    
    Args:
        user_data: dict with email, name, password, role, school_id (optional), is_active (optional)
    """
    db = get_db()
    
    email = user_data.get("email")
    
    # Check if user already exists
    if db.users.find_one({"email": email}):
        logger.warning(f"❌ User creation failed - email exists: {email}")
        return None

    user = {
        "email": email,
        "name": user_data.get("name"),
        "password": user_data.get("password"),  # Plaintext for dev only
        "role": user_data.get("role"),
        "school_id": user_data.get("school_id"),  # For Admin users, links to school
        "created_at": user_data.get("created_at", datetime.utcnow()),
        "updated_at": user_data.get("updated_at", datetime.utcnow()),
        "is_active": user_data.get("is_active", True),
    }

    result = db.users.insert_one(user)
    user["id"] = str(result.inserted_id)
    
    logger.info(f"✅ Created user: {email} (Role: {user['role']}, School: {user.get('school_id', 'N/A')})")
    return user

def get_user_by_email(email: str) -> Optional[dict]:
    """Get user by email"""
    db = get_db()
    user = db.users.find_one({"email": email})
    if user:
        user["id"] = str(user["_id"])
    return user

def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get user by ID"""
    db = get_db()
    try:
        user = db.users.find_one({"_id": ObjectId(user_id)})
        if user:
            user["id"] = str(user["_id"])
        return user
    except:
        return None

def get_all_users(filters: Dict = None) -> list:
    """Get all users with optional filters"""
    db = get_db()
    query = filters or {}
    users = list(db.users.find(query))
    for user in users:
        user["id"] = str(user["_id"])
    return users

def update_user(user_id: str, update_data=None, **kwargs) -> Optional[dict]:
    """Update user
    
    Args:
        user_id: User ID
        update_data: BaseModel or dict with fields to update
        **kwargs: Individual fields to update (used if update_data not provided)
    """
    db = get_db()
    try:
        # Handle Pydantic model
        if update_data and hasattr(update_data, 'dict'):
            data_to_update = update_data.dict(exclude_unset=True)
        elif update_data:
            data_to_update = update_data if isinstance(update_data, dict) else kwargs
        else:
            data_to_update = kwargs
        
        data_to_update["updated_at"] = datetime.utcnow()
        result = db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": data_to_update},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
            logger.info(f"✅ Updated user: {user_id}")
        return result
    except Exception as e:
        logger.error(f"❌ Failed to update user {user_id}: {str(e)}")
        return None

def delete_user(user_id: str) -> bool:
    """Soft delete user (deactivate)"""
    db = get_db()
    try:
        result = db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
            return_document=True
        )
        if result:
            logger.info(f"✅ Deleted (deactivated) user: {user_id}")
            return True
        return False
    except:
        return False

# ================= Role Operations =================

def create_role(name: str, description: str, permissions: list) -> Optional[dict]:
    """Create a new role"""
    db = get_db()

    # Check if role already exists
    if db.roles.find_one({"name": name}):
        return None

    role = {
        "name": name,
        "description": description,
        "permissions": permissions,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.roles.insert_one(role)
    role["_id"] = str(result.inserted_id)
    return role

def get_role_by_name(name: str) -> Optional[dict]:
    """Get role by name"""
    db = get_db()
    role = db.roles.find_one({"name": name})
    if role:
        role["id"] = str(role["_id"])
    return role

def get_role_by_id(role_id: str) -> Optional[dict]:
    """Get role by ID"""
    db = get_db()
    try:
        role = db.roles.find_one({"_id": ObjectId(role_id)})
        if role:
            role["id"] = str(role["_id"])
        return role
    except:
        return None

def get_all_roles() -> list:
    """Get all roles. Returns default roles if collection is empty or on error."""
    DEFAULT_ROLES = [
        {"id": "default_admin", "name": "Admin", "description": "Full access to all features", "permissions": ["*"]},
        {"id": "default_teacher", "name": "Teacher", "description": "Access to students, classes, attendance", "permissions": ["students:read", "classes:read", "attendance:*"]},
        {"id": "default_accountant", "name": "Accountant", "description": "Access to fees and payments", "permissions": ["fees:*", "payments:*", "students:read"]},
    ]
    try:
        db = get_db()
        roles = list(db.roles.find())
        if not roles:
            # Return default roles if collection is empty
            return DEFAULT_ROLES
        for role in roles:
            role["id"] = str(role["_id"])
        return roles
    except Exception as e:
        # Return default roles on any error (connection, empty db, etc.)
        import logging
        logging.getLogger(__name__).warning(f"Failed to fetch roles, returning defaults: {e}")
        return DEFAULT_ROLES

def update_role(role_id: str, **kwargs) -> Optional[dict]:
    """Update role"""
    db = get_db()
    try:
        kwargs["updated_at"] = datetime.utcnow()
        result = db.roles.find_one_and_update(
            {"_id": ObjectId(role_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None

def delete_role(role_id: str) -> bool:
    """Delete role"""
    db = get_db()
    try:
        result = db.roles.delete_one({"_id": ObjectId(role_id)})
        return result.deleted_count > 0
    except:
        return False