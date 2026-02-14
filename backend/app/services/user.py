from app.database import get_db
from app.models.user import UserInDB, RoleSchema
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId

# ================= User Operations =================

def create_user(email: str, name: str, password: str, role: str) -> Optional[dict]:
    """Create a new user with plaintext password (dev only)"""
    db = get_db()

    # Check if user already exists
    if db.users.find_one({"email": email}):
        return None

    user = {
        "email": email,
        "name": name,
        "password": password,  # Plaintext for dev only
        "role": role,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_active": True,
    }

    result = db.users.insert_one(user)
    user["_id"] = str(result.inserted_id)
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

def get_all_users() -> list:
    """Get all users"""
    db = get_db()
    users = list(db.users.find())
    for user in users:
        user["id"] = str(user["_id"])
    return users

def update_user(user_id: str, **kwargs) -> Optional[dict]:
    """Update user"""
    db = get_db()
    try:
        kwargs["updated_at"] = datetime.utcnow()
        result = db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None

def delete_user(user_id: str) -> bool:
    """Delete user"""
    db = get_db()
    try:
        result = db.users.delete_one({"_id": ObjectId(user_id)})
        return result.deleted_count > 0
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
    """Get all roles"""
    db = get_db()
    roles = list(db.roles.find())
    for role in roles:
        role["id"] = str(role["_id"])
    return roles

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