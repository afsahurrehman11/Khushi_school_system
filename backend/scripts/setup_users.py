#!/usr/bin/env python3
"""
Simple User and Role Setup Script

Creates roles and users without deleting existing ones.
Run with: python backend/scripts/setup_users.py
"""

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import get_db
from datetime import datetime

def create_role(name: str, description: str, permissions: list):
    """Create a new role"""
    db = get_db()

    # Check if role already exists
    if db.roles.find_one({"name": name}):
        print(f"   Role {name} already exists")
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

def create_user(email: str, name: str, password: str, role: str):
    """Create a new user"""
    db = get_db()

    # Check if user already exists
    if db.users.find_one({"email": email}):
        print(f"   User {email} already exists")
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

def main():
    """Main execution function"""
    print("🚀 Setting up Users and Roles")
    print("=" * 40)

    try:
        # Create roles
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
                    "users.manage_school",
                    "users.view_school"
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
                print(f"   ✅ Created role: {role_data['name']}")

        # Create users
        print("\n👤 Creating users...")

        # Create Root user
        root_user = create_user(
            email="root@system.edu",
            name="System Root Administrator",
            password="rootpass123",
            role="Root"
        )
        if root_user:
            print("   ✅ Created Root user: root@system.edu")

        # Create School Admin user
        admin_user = create_user(
            email="admin@school.edu",
            name="School Administrator",
            password="adminpass123",
            role="Admin"
        )
        if admin_user:
            print("   ✅ Created Admin user: admin@school.edu")

        print("\n" + "=" * 40)
        print("✅ Setup completed successfully!")
        print("\n📝 Login Credentials:")
        print("   Root Admin: root@system.edu / rootpass123")
        print("   School Admin: admin@school.edu / adminpass123")

    except Exception as e:
        print(f"\n❌ Error during setup: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()