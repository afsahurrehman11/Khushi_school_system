"""
Fix Root User in MongoDB Atlas

This script connects directly to MongoDB Atlas and fixes the root@edu user
by converting 'password' field to 'password_hash' with SHA256.

Usage:
    python scripts/fix_atlas_root_user.py "your-mongodb-atlas-uri"

Example:
    python scripts/fix_atlas_root_user.py "mongodb+srv://root:yourpassword@cluster0.xxx.mongodb.net/khushi_school"
"""

import sys
import hashlib
from pymongo import MongoClient
from datetime import datetime

ROOT_EMAIL = "root@edu"


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def fix_root_user(mongo_uri: str):
    """Fix the root user password field in MongoDB Atlas"""
    
    print("\n" + "="*70)
    print("🔧 FIXING ROOT USER IN MONGODB ATLAS")
    print("="*70)
    
    try:
        print(f"\n📡 Connecting to MongoDB...")
        print(f"   URI: {mongo_uri[:50]}...")
        
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
        
        # Test connection
        client.admin.command('ping')
        print("   ✅ Connected successfully!")
        
        # Get saas_root_db
        root_db = client["saas_root_db"]
        
        # Find all root@edu users
        users = list(root_db.global_users.find({"email": ROOT_EMAIL}))
        print(f"\n📋 Found {len(users)} user(s) with email '{ROOT_EMAIL}':")
        
        for i, user in enumerate(users):
            print(f"\n   User {i+1}:")
            print(f"     _id: {user.get('_id')}")
            print(f"     email: {user.get('email')}")
            print(f"     role: {user.get('role')}")
            print(f"     has 'password': {'password' in user}")
            print(f"     has 'password_hash': {'password_hash' in user}")
            print(f"     is_active: {user.get('is_active')}")
        
        if not users:
            print("\n⚠️  No root user found! Creating one...")
            hashed = hash_password("111")
            root_db.global_users.insert_one({
                "email": ROOT_EMAIL,
                "name": "Root Administrator",
                "password_hash": hashed,
                "role": "root",
                "school_id": None,
                "school_slug": None,
                "database_name": None,
                "is_active": True,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            })
            print("   ✅ Created root user with password '111'")
            return True
        
        # Fix each user that has 'password' but not 'password_hash'
        fixed = 0
        for user in users:
            if 'password_hash' in user and user.get('password_hash'):
                print(f"\n✅ User {user.get('_id')} already has password_hash - skipping")
                continue
            
            plain_password = user.get('password', '111')
            hashed = hash_password(plain_password)
            
            print(f"\n🔧 Fixing user {user.get('_id')}...")
            print(f"   Plain password: {plain_password}")
            print(f"   SHA256 hash: {hashed[:30]}...")
            
            result = root_db.global_users.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "password_hash": hashed,
                        "name": user.get("name", "Root Administrator"),
                        "school_id": user.get("school_id"),
                        "school_slug": user.get("school_slug"),
                        "database_name": user.get("database_name"),
                        "updated_at": datetime.utcnow().isoformat()
                    },
                    "$unset": {"password": ""}
                }
            )
            
            if result.modified_count > 0:
                print("   ✅ Fixed successfully!")
                fixed += 1
            else:
                print("   ⚠️  No changes made")
        
        print(f"\n{'='*70}")
        print(f"✅ DONE! Fixed {fixed} user(s)")
        print(f"\n🔑 Login credentials:")
        print(f"   Email: {ROOT_EMAIL}")
        print(f"   Password: 111")
        print(f"{'='*70}\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("\n⚠️  If you see 'bad auth', your MongoDB password might be wrong.")
        print("   Check your MongoDB Atlas credentials.\n")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nUsage: python scripts/fix_atlas_root_user.py <MONGO_URI>")
        print("\nExample:")
        print('  python scripts/fix_atlas_root_user.py "mongodb+srv://root:password@cluster0.xxx.mongodb.net/db"')
        print("\n⚠️  Make sure to quote the URI if it contains special characters!")
        sys.exit(1)
    
    mongo_uri = sys.argv[1]
    fix_root_user(mongo_uri)
