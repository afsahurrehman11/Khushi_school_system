"""
Setup Root User Script

Creates the root@edu user in saas_root_db.global_users if it doesn't exist.

This script should be run once during initial system setup.
The root user is the super admin who can:
- Create and manage schools
- Create admin accounts for schools
- Access billing and analytics
- Manage the entire SaaS platform

Usage:
    python scripts/setup_root_user.py

You will be prompted for the root password.
"""

import sys
import os
import hashlib
import getpass

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pymongo import MongoClient
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Root user configuration
ROOT_EMAIL = "root@edu"
ROOT_NAME = "Root Administrator"


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_mongo_client():
    """Get MongoDB client from environment or default"""
    from app.config import settings
    uri = settings.mongo_uri
    return MongoClient(uri)


def setup_root_user():
    """Create root user if it doesn't exist"""
    
    print("\n" + "="*60)
    print("🔐 ROOT USER SETUP")
    print("="*60)
    print(f"\nRoot email: {ROOT_EMAIL}")
    print(f"Root name:  {ROOT_NAME}")
    print("="*60)
    
    try:
        client = get_mongo_client()
        root_db = client["saas_root_db"]
        
        # Check if root user already exists
        existing = root_db.global_users.find_one({"email": ROOT_EMAIL})
        
        if existing:
            print(f"\n✅ Root user already exists: {ROOT_EMAIL}")
            
            # Ask if they want to reset the password
            reset = input("\nDo you want to reset the password? (yes/no): ")
            if reset.lower() == "yes":
                password = getpass.getpass("Enter new password (min 6 chars): ")
                if len(password) < 6:
                    print("❌ Password must be at least 6 characters")
                    return False
                
                confirm = getpass.getpass("Confirm password: ")
                if password != confirm:
                    print("❌ Passwords do not match")
                    return False
                
                root_db.global_users.update_one(
                    {"email": ROOT_EMAIL},
                    {
                        "$set": {
                            "password_hash": hash_password(password),
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                print(f"\n✅ Password reset successfully for {ROOT_EMAIL}")
            return True
        
        # Create new root user
        print("\n📝 Creating new root user...")
        
        password = getpass.getpass("Enter root password (min 6 chars): ")
        if len(password) < 6:
            print("❌ Password must be at least 6 characters")
            return False
        
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords do not match")
            return False
        
        now = datetime.utcnow()
        
        root_user_doc = {
            "name": ROOT_NAME,
            "email": ROOT_EMAIL,
            "password_hash": hash_password(password),
            "role": "root",
            "school_id": None,
            "school_slug": None,
            "database_name": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        
        result = root_db.global_users.insert_one(root_user_doc)
        
        # Create unique index on email if not exists
        root_db.global_users.create_index("email", unique=True)
        
        print(f"\n✅ Root user created successfully!")
        print(f"\n📋 Login Credentials:")
        print(f"   Email:    {ROOT_EMAIL}")
        print(f"   Password: (the password you just entered)")
        print(f"\n⚠️  Keep these credentials safe!")
        print("="*60)
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to setup root user: {e}")
        return False


if __name__ == "__main__":
    setup_root_user()
