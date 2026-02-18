"""
Create Test Accountant User
Run this script to create a test accountant with proper permissions
"""
from pymongo import MongoClient
from datetime import datetime
import os

# Connect to MongoDB
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
client = MongoClient(MONGO_URI)
db = client["khushi_school"]

# School ID (use existing school or create test school)
school_id = "6994a440e5c52bf1ce8980ed"

# Create accountant user
accountant = {
    "email": "accountant@test.com",
    "name": "Test Accountant",
    "password": "password123",  # Plaintext for dev
    "role": "Accountant",
    "school_id": school_id,
    "is_active": True,
    "created_at": datetime.utcnow(),
    "updated_at": datetime.utcnow()
}

# Check if user exists
existing = db.users.find_one({"email": accountant["email"]})
if existing:
    print(f"✅ User already exists: {accountant['email']}")
    print(f"   ID: {existing['_id']}")
    print(f"   Role: {existing['role']}")
    print(f"   School: {existing['school_id']}")
else:
    result = db.users.insert_one(accountant)
    print(f"✅ Created accountant user: {accountant['email']}")
    print(f"   ID: {result.inserted_id}")
    print(f"   Password: password123")
    print(f"   Role: Accountant")
    print(f"   School ID: {school_id}")

# Create role with permissions if it doesn't exist
accountant_role = {
    "name": "Accountant",
    "description": "Accountant with fee management permissions",
    "permissions": [
        "fees.view",
        "fees.manage",
        "students.read",
        "classes.read",
        "accounting.dashboard_view",
        "reports.view"
    ],
    "created_at": datetime.utcnow(),
    "updated_at": datetime.utcnow()
}

existing_role = db.roles.find_one({"name": "Accountant"})
if not existing_role:
    db.roles.insert_one(accountant_role)
    print(f"\n✅ Created Accountant role with permissions:")
    for perm in accountant_role["permissions"]:
        print(f"   - {perm}")
else:
    print(f"\n✅ Accountant role already exists with permissions:")
    for perm in existing_role.get("permissions", []):
        print(f"   - {perm}")

print("\n" + "="*50)
print("Test Credentials:")
print("Email: accountant@test.com")
print("Password: password123")
print("="*50)
