#!/usr/bin/env python3
"""
Database Reset and User Setup Script

This script:
1. Deletes all existing users
2. Creates all required roles (Root, Admin, Accountant, Teacher, Inventory Manager)
3. Creates 1 Root user
4. Creates 1 Admin user for a school
5. Ensures proper permission structure

Run with: python backend/scripts/reset_users_and_roles.py
"""

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import get_db
from datetime import datetime

def create_user(email: str, name: str, password: str, role: str):
    """Create a new user"""
    db = get_db()

    # Check if user already exists
    if db.users.find_one({"email": email}):
        return None

    user = {
        "email": email,
        "name": name,
        "password": password,
        "role": role,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_active": True,
    }

    result = db.users.insert_one(user)
    user["_id"] = str(result.inserted_id)
    return user

def create_role(name: str, description: str, permissions: list):
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

def get_all_roles():
    """Get all roles"""
    db = get_db()
    roles = list(db.roles.find())
    for role in roles:
        role["id"] = str(role["_id"])
    return roles

def hash_password(password: str) -> str:
    """Return password as-is for dev environment (plaintext)"""
    return password

def reset_database():
    """Reset users and roles in database"""
    db = get_db()

    print("🗑️  Deleting all existing users...")
    try:
        result = db.users.delete_many({})
        print(f"   Deleted {result.deleted_count} users")
    except Exception as e:
        print(f"   Error deleting users: {e}")

    print("🗑️  Deleting all existing roles...")
    try:
        result = db.roles.delete_many({})
        print(f"   Deleted {result.deleted_count} roles")
    except Exception as e:
        print(f"   Error deleting roles: {e}")

def create_roles():
    """Create all required roles with proper permissions"""
    print("\n📋 Creating roles...")

    roles_data = [
        {
            "name": "Root",
            "description": "System Root Administrator - Full system access",
            "permissions": [
                "system.manage_access",
                "system.view_overview",
                "users.manage_all",
                "users.view_all",
                "roles.manage_all",
                "roles.view_all"
            ]
        },
        {
            "name": "Admin",
            "description": "School Administrator - Can manage school operations",
            "permissions": [
                "students.read", "students.write",
                "teachers.read", "teachers.write",
                "academics.assign_subjects", "academics.view_classes",
                "fees.manage", "fees.view", "accounting.dashboard_view",
                "inventory.manage", "inventory.view", "sales.manage",
                "reports.view",
                "users.manage_school",  # Can create users with school roles only
                "users.view_school"     # Can view school users only
            ]
        },
        {
            "name": "Accountant",
            "description": "School Accountant - Handles financial operations",
            "permissions": [
                "students.read",
                "fees.manage", "fees.view", "accounting.dashboard_view",
                "reports.view"
            ]
        },
        {
            "name": "Teacher",
            "description": "School Teacher - Manages students and academics",
            "permissions": [
                "students.read",
                "academics.view_classes", "academics.assign_subjects"
            ]
        },
        {
            "name": "Inventory Manager",
            "description": "Inventory and Sales Manager",
            "permissions": [
                "inventory.manage", "inventory.view", "sales.manage"
            ]
        }
    ]

    for role_data in roles_data:
        role = create_role(
            name=role_data["name"],
            description=role_data["description"],
            permissions=role_data["permissions"]
        )
        if role:
            print(f"   ✅ Created role: {role_data['name']} ({len(role_data['permissions'])} permissions)")
        else:
            print(f"   ❌ Failed to create role: {role_data['name']}")

def create_users():
    """Create root and admin users"""
    print("\n👤 Creating users...")

    # Create Root user
    root_user = create_user(
        email="root@system.edu",
        name="System Root Administrator",
        password=hash_password("rootpass123"),  # In production, use proper password hashing
        role="Root"
    )
    if root_user:
        print("   ✅ Created Root user: root@system.edu")
    else:
        print("   ❌ Failed to create Root user")

    # Create School Admin user
    admin_user = create_user(
        email="admin@school.edu",
        name="School Administrator",
        password=hash_password("adminpass123"),  # In production, use proper password hashing
        role="Admin"
    )
    if admin_user:
        print("   ✅ Created Admin user: admin@school.edu")
    else:
        print("   ❌ Failed to create Admin user")

def verify_setup():
    """Verify the setup is correct"""
    print("\n🔍 Verifying setup...")

    db = get_db()

    # Check roles
    roles = get_all_roles()
    print(f"   📋 Total roles created: {len(roles)}")
    for role in roles:
        print(f"      - {role['name']}: {len(role.get('permissions', []))} permissions")

    # Check users
    users = db.users.find({})
    user_count = 0
    for user in users:
        user_count += 1
        print(f"      - {user['email']} ({user['role']})")

    print(f"   👤 Total users created: {user_count}")

    # Verify permissions
    root_role = next((r for r in roles if r['name'] == 'Root'), None)
    admin_role = next((r for r in roles if r['name'] == 'Admin'), None)

    if root_role and 'users.manage_all' in root_role.get('permissions', []):
        print("   ✅ Root has full user management permissions")
    else:
        print("   ❌ Root missing full user management permissions")

    if admin_role and 'users.manage_school' in admin_role.get('permissions', []):
        print("   ✅ Admin has school user management permissions")
    else:
        print("   ❌ Admin missing school user management permissions")

    if admin_role and 'users.manage_all' not in admin_role.get('permissions', []):
        print("   ✅ Admin cannot manage all users (Root protection)")
    else:
        print("   ❌ Admin has unrestricted user management (security risk)")

def main():
    """Main execution function"""
    print("🚀 Starting Database Reset and User Setup")
    print("=" * 50)

    try:
        reset_database()
        create_roles()
        create_users()
        verify_setup()

        print("\n" + "=" * 50)
        print("✅ Database reset and user setup completed successfully!")
        print("\n📝 Login Credentials:")
        print("   Root Admin: root@system.edu / rootpass123")
        print("   School Admin: admin@school.edu / adminpass123")
        print("\n⚠️  IMPORTANT:")
        print("   - Root user cannot be deleted by School Admin")
        print("   - School Admin can only create users with existing school roles")
        print("   - Change default passwords in production!")

    except Exception as e:
        print(f"\n❌ Error during setup: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()