"""
Check MongoDB Indexes
Verifies that all performance indexes have been created successfully
"""

import sys
import os
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import get_database

def check_indexes():
    """Check all indexes in the database"""
    print("\n" + "=" * 60)
    print("MongoDB Index Verification")
    print("=" * 60 + "\n")
    
    db = get_database()
    
    collections_to_check = [
        'students',
        'attendance',
        'employee_attendance',
        'teachers',
        'classes'
    ]
    
    total_indexes = 0
    
    for collection_name in collections_to_check:
        print(f"\n📋 {collection_name.upper()} Collection:")
        print("-" * 60)
        
        collection = db[collection_name]
        indexes = list(collection.list_indexes())
        
        if len(indexes) <= 1:  # Only default _id index
            print("❌ NO CUSTOM INDEXES FOUND")
            print("   Run: python app/scripts/create_performance_indexes.py")
        else:
            print(f"✅ {len(indexes)} indexes found\n")
            
            for idx in indexes:
                index_name = idx.get('name', 'N/A')
                index_keys = idx.get('key', {})
                
                if index_name == '_id_':
                    continue  # Skip default index
                
                # Format index keys for display
                keys_str = ', '.join([f"{k}: {v}" for k, v in index_keys.items()])
                
                print(f"   • {index_name}")
                print(f"     Keys: {keys_str}")
                
                # Show additional properties
                if idx.get('background'):
                    print("     Background: True")
                if idx.get('unique'):
                    print("     Unique: True")
                
                print()
                
            total_indexes += len(indexes) - 1  # Subtract default _id index
    
    print("\n" + "=" * 60)
    print(f"✅ Total custom indexes: {total_indexes}")
    print("=" * 60 + "\n")
    
    # Expected index count
    expected_indexes = {
        'students': 5,  # school_id+status, school_id, student_id, class_id, registration_number
        'attendance': 3,  # school_id+date, school_id+date+status, student_id+date
        'employee_attendance': 3,  # school_id+date, school_id+date+status, teacher_id+date
        'teachers': 2,  # school_id, teacher_id
        'classes': 1,  # school_id
    }
    
    total_expected = sum(expected_indexes.values())
    
    if total_indexes >= total_expected:
        print("✅ All expected indexes are present!")
        print(f"   Performance queries should be very fast now.\n")
        return True
    else:
        print(f"⚠️  Expected {total_expected} indexes, found {total_indexes}")
        print("   Some indexes may be missing.\n")
        print("   Run: python app/scripts/create_performance_indexes.py")
        return False

if __name__ == "__main__":
    try:
        check_indexes()
    except Exception as e:
        print(f"\n❌ Error: {e}\n")
        sys.exit(1)
