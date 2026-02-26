"""
MongoDB Connection Diagnostic & Root User Fix Script

This script:
1. Tests MongoDB Atlas connection with your credentials
2. Deletes any corrupted root user
3. Creates a fresh root user with correct fields

Usage:
    python scripts/fix_everything.py
"""

import sys
import hashlib
from pymongo import MongoClient
from datetime import datetime, timezone

# =============================================================================
# CONFIGURATION - UPDATE THESE IF NEEDED
# =============================================================================

# Your MongoDB Atlas connection string (password already URL-encoded)
MONGO_URI = "mongodb+srv://root:khushi-root-DB-%40%2A007@cluster0.zml92km.mongodb.net/"

# Root user credentials
ROOT_EMAIL = "root@edu"
ROOT_PASSWORD = "111"  # Plain text password for login

# =============================================================================


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def test_connection(uri: str) -> bool:
    """Test MongoDB connection"""
    print("\n" + "="*70)
    print("📡 TESTING MONGODB CONNECTION")
    print("="*70)
    print(f"\nURI: {uri[:60]}...")
    
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        client.admin.command('ping')
        print("✅ Connection successful!")
        client.close()
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


def fix_root_user(uri: str) -> bool:
    """Delete and recreate root user"""
    print("\n" + "="*70)
    print("🔧 FIXING ROOT USER")
    print("="*70)
    
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        root_db = client["saas_root_db"]
        
        # Step 1: Find all existing root@edu users
        existing_users = list(root_db.global_users.find({"email": ROOT_EMAIL}))
        print(f"\n📋 Found {len(existing_users)} existing root@edu user(s)")
        
        for i, user in enumerate(existing_users):
            print(f"\n   User {i+1}:")
            print(f"     _id: {user.get('_id')}")
            print(f"     has 'password': {'password' in user}")
            print(f"     has 'password_hash': {'password_hash' in user}")
        
        # Step 2: Delete ALL existing root@edu users
        if existing_users:
            print(f"\n🗑️  Deleting all existing root@edu users...")
            result = root_db.global_users.delete_many({"email": ROOT_EMAIL})
            print(f"   Deleted {result.deleted_count} user(s)")
        
        # Step 3: Create fresh root user with BOTH password fields
        print(f"\n➕ Creating fresh root user...")
        
        password_hash = hash_password(ROOT_PASSWORD)
        now = datetime.now(timezone.utc).isoformat()
        
        new_user = {
            "email": ROOT_EMAIL,
            "name": "Root Administrator",
            "password": ROOT_PASSWORD,           # Plain text for fallback
            "password_hash": password_hash,      # SHA256 hash
            "role": "root",
            "school_id": None,
            "school_slug": None,
            "database_name": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        
        result = root_db.global_users.insert_one(new_user)
        print(f"   ✅ Created user with _id: {result.inserted_id}")
        
        # Step 4: Verify the user was created correctly
        print(f"\n📋 Verifying new user...")
        final_user = root_db.global_users.find_one({"email": ROOT_EMAIL})
        
        if final_user:
            print(f"   email: {final_user.get('email')}")
            print(f"   password: {final_user.get('password')}")
            print(f"   password_hash: {final_user.get('password_hash')[:30]}...")
            print(f"   role: {final_user.get('role')}")
            print(f"   is_active: {final_user.get('is_active')}")
        
        client.close()
        
        print(f"\n{'='*70}")
        print("✅ ROOT USER FIXED SUCCESSFULLY!")
        print(f"\n🔑 Login credentials:")
        print(f"   Email: {ROOT_EMAIL}")
        print(f"   Password: {ROOT_PASSWORD}")
        print(f"{'='*70}\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def main():
    print("\n" + "="*70)
    print("🔧 MONGODB DIAGNOSTIC & ROOT USER FIX SCRIPT")
    print("="*70)
    
    # Test connection first
    if not test_connection(MONGO_URI):
        print("\n⚠️  Cannot proceed without MongoDB connection.")
        print("   Please verify your MongoDB Atlas credentials:")
        print("   1. Go to MongoDB Atlas → Database Access")
        print("   2. Check that user 'root' exists")
        print("   3. Verify the password is: khushi-root-DB-@*007")
        print("   4. Ensure Network Access allows 0.0.0.0/0")
        return False
    
    # Fix root user
    return fix_root_user(MONGO_URI)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
