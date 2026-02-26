"""
Create Root User in MongoDB Atlas

This script connects to your MongoDB Atlas and creates/updates the root@edu user
with the correct fields for authentication.

Usage:
    python scripts/create_root_user.py
"""

import sys
import os
from pymongo import MongoClient
from datetime import datetime

# Your MongoDB Atlas connection string
MONGO_URI = "mongodb+srv://root:khushi-root-DB-%40%2A007@cluster0.zml92km.mongodb.net/"

# Root user data
ROOT_USER = {
    "email": "root@edu",
    "password": "111",  # Plain password as requested
    "name": "Root Administrator",
    "role": "root",
    "school_id": None,
    "school_slug": None,
    "database_name": None,
    "is_active": True,
    "created_at": datetime.utcnow().isoformat(),
    "updated_at": datetime.utcnow().isoformat()
}


def create_root_user():
    """Create or update the root user in MongoDB Atlas"""

    print("\n" + "="*60)
    print("🔧 CREATING ROOT USER IN MONGODB ATLAS")
    print("="*60)

    try:
        print(f"\n📡 Connecting to MongoDB Atlas...")
        print(f"   URI: {MONGO_URI[:50]}...")

        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)

        # Test connection
        client.admin.command('ping')
        print("   ✅ Connected successfully!")

        # Get saas_root_db
        root_db = client["saas_root_db"]

        # Check if root user already exists
        existing = root_db.global_users.find_one({"email": "root@edu"})

        if existing:
            print(f"\n📋 Root user already exists:")
            print(f"   _id: {existing.get('_id')}")
            print(f"   email: {existing.get('email')}")
            print(f"   role: {existing.get('role')}")
            print(f"   has password: {'password' in existing}")
            print(f"   has password_hash: {'password_hash' in existing}")

            # Update the existing user
            result = root_db.global_users.update_one(
                {"email": "root@edu"},
                {"$set": ROOT_USER}
            )

            if result.modified_count > 0:
                print("   ✅ Updated existing root user!")
            else:
                print("   ⚠️  No changes needed")
        else:
            # Insert new user
            result = root_db.global_users.insert_one(ROOT_USER)
            print(f"   ✅ Created new root user with ID: {result.inserted_id}")

        # Verify the user was created/updated correctly
        final_user = root_db.global_users.find_one({"email": "root@edu"})
        print(f"\n📋 Final root user document:")
        for key, value in final_user.items():
            if key != '_id':  # Skip ObjectId for readability
                print(f"   {key}: {value}")

        print(f"\n{'='*60}")
        print("✅ SUCCESS! Root user is ready for login")
        print(f"\n🔑 Login credentials:")
        print(f"   Email: root@edu")
        print(f"   Password: 111")
        print(f"{'='*60}\n")

        client.close()
        return True

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("\n⚠️  Possible issues:")
        print("   - MongoDB Atlas connection string is incorrect")
        print("   - Network/firewall blocking connection")
        print("   - Atlas user doesn't have proper permissions")
        return False


if __name__ == "__main__":
    success = create_root_user()
    sys.exit(0 if success else 1)
