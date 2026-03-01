"""
Script to check and fix Admin users in global_users who are missing school context.

This ensures all Admin users have:
- school_id
- school_slug
- database_name

Run this if Admins are getting "School admin must be properly configured with school context" errors.
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from pymongo import MongoClient
from datetime import datetime

def get_mongo_client():
    """Get MongoDB client"""
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    return MongoClient(mongo_uri)

def fix_admin_school_context():
    """Fix Admin users missing school context"""
    client = get_mongo_client()
    
    # Connect to saas_root_db
    root_db = client['saas_root_db']
    
    print("=" * 80)
    print("Checking Admin users in global_users...")
    print("=" * 80)
    
    # Find all Admin users
    admins = list(root_db.global_users.find({"role": "admin"}))
    
    if not admins:
        print("❌ No Admin users found in global_users!")
        return
    
    print(f"\n✅ Found {len(admins)} Admin user(s)")
    
    fixed_count = 0
    missing_school_count = 0
    
    for admin in admins:
        email = admin.get('email', 'unknown')
        user_id = admin.get('_id')
        school_id = admin.get('school_id')
        school_slug = admin.get('school_slug')
        database_name = admin.get('database_name')
        
        print(f"\n{'='*80}")
        print(f"Admin: {email}")
        print(f"  User ID: {user_id}")
        print(f"  School ID: {school_id or 'MISSING ❌'}")
        print(f"  School Slug: {school_slug or 'MISSING ❌'}")
        print(f"  Database Name: {database_name or 'MISSING ❌'}")
        
        # Check if any field is missing
        if not school_id or not school_slug or not database_name:
            print(f"\n  ⚠️  Missing school context! Attempting to fix...")
            
            # Try to find the school this admin belongs to
            # Strategy: Look for schools and try to match
            schools = list(root_db.schools.find({"status": "active"}))
            
            if len(schools) == 0:
                print(f"  ❌ No schools found in database!")
                missing_school_count += 1
                continue
            elif len(schools) == 1:
                # Only one school - assign to it
                school = schools[0]
                new_school_id = school.get('school_id')
                new_school_slug = school.get('school_slug')
                new_database_name = school.get('database_name')
                
                print(f"  ✅ Found single school: {school.get('display_name')}")
                print(f"     Assigning admin to this school...")
                
                # Update the admin user
                update_data = {
                    "school_id": new_school_id,
                    "school_slug": new_school_slug,
                    "database_name": new_database_name,
                    "updated_at": datetime.utcnow()
                }
                
                root_db.global_users.update_one(
                    {"_id": user_id},
                    {"$set": update_data}
                )
                
                print(f"  ✅ Fixed! Admin now has school context:")
                print(f"     School ID: {new_school_id}")
                print(f"     School Slug: {new_school_slug}")
                print(f"     Database: {new_database_name}")
                
                fixed_count += 1
            else:
                # Multiple schools - need manual intervention
                print(f"  ⚠️  Multiple schools found ({len(schools)}). Cannot auto-assign.")
                print(f"  Available schools:")
                for i, school in enumerate(schools, 1):
                    print(f"    {i}. {school.get('display_name')} (slug: {school.get('school_slug')})")
                print(f"  Please manually assign this admin to a school.")
                missing_school_count += 1
        else:
            print(f"  ✅ School context is complete!")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY:")
    print(f"  Total Admins: {len(admins)}")
    print(f"  Fixed: {fixed_count}")
    print(f"  Still Missing Context: {missing_school_count}")
    print(f"  Already OK: {len(admins) - fixed_count - missing_school_count}")
    print(f"{'='*80}")
    
    if fixed_count > 0:
        print(f"\n✅ Fixed {fixed_count} admin user(s)!")
        print(f"   They should now be able to create users from Admin Dashboard.")
    
    if missing_school_count > 0:
        print(f"\n⚠️  {missing_school_count} admin(s) still need manual assignment.")
        print(f"   Run this command to manually fix:")
        print(f"   ```")
        print(f"   from app.services.saas_db import *")
        print(f"   root_db = get_saas_root_db()")
        print(f"   root_db.global_users.update_one(")
        print(f"       {{'email': 'admin@example.com'}},")
        print(f"       {{'$set': {{'school_id': '...', 'school_slug': '...', 'database_name': '...'}}}}")
        print(f"   )")
        print(f"   ```")

if __name__ == "__main__":
    try:
        fix_admin_school_context()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
