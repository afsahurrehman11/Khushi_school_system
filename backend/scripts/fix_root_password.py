"""
Fix Root User Password Field

This script fixes the root@edu user by:
1. Converting plain 'password' field to 'password_hash' with SHA256
2. Ensuring the correct field name is used

Usage:
    python scripts/fix_root_password.py
"""

import sys
import os
import hashlib

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pymongo import MongoClient
from datetime import datetime

ROOT_EMAIL = "root@edu"
DEFAULT_PASSWORD = "111"


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_mongo_client():
    """Get MongoDB client from environment or default"""
    from app.config import settings
    uri = settings.mongo_uri
    return MongoClient(uri)


def fix_root_user():
    """Fix the root user password field"""
    
    print("\n" + "="*60)
    print("🔧 FIXING ROOT USER PASSWORD FIELD")
    print("="*60)
    
    try:
        client = get_mongo_client()
        root_db = client["saas_root_db"]
        
        # Find root user
        user = root_db.global_users.find_one({"email": ROOT_EMAIL})
        
        if not user:
            print(f"❌ Root user not found: {ROOT_EMAIL}")
            return False
        
        print(f"\n📋 Current user document:")
        print(f"   _id: {user.get('_id')}")
        print(f"   email: {user.get('email')}")
        print(f"   role: {user.get('role')}")
        print(f"   has 'password' field: {'password' in user}")
        print(f"   has 'password_hash' field: {'password_hash' in user}")
        
        # Check if fix is needed
        if 'password_hash' in user and user.get('password_hash'):
            print(f"\n✅ User already has password_hash field. No fix needed.")
            return True
        
        # Get the plain password and hash it
        plain_password = user.get('password', DEFAULT_PASSWORD)
        hashed_password = hash_password(plain_password)
        
        print(f"\n🔐 Fixing password field:")
        print(f"   Plain password: {plain_password}")
        print(f"   SHA256 hash: {hashed_password[:20]}...")
        
        # Update the user
        result = root_db.global_users.update_one(
            {"email": ROOT_EMAIL},
            {
                "$set": {"password_hash": hashed_password},
                "$unset": {"password": ""}  # Remove the old plain password field
            }
        )
        
        if result.modified_count > 0:
            print(f"\n✅ Successfully fixed root user password!")
            print(f"   - Added 'password_hash' field with SHA256 hash")
            print(f"   - Removed plain 'password' field")
            print(f"\n🔑 You can now login with:")
            print(f"   Email: {ROOT_EMAIL}")
            print(f"   Password: {plain_password}")
            return True
        else:
            print(f"\n⚠️ No changes made (document may already be correct)")
            return True
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False


if __name__ == "__main__":
    fix_root_user()
