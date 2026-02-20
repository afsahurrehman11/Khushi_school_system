"""
Add a missing permission to the Admin role.

Usage: python add_permission_to_admin.py

This script will read MONGO_URI from env or default to
mongodb://localhost:27017/khushi_school and update the role named
"Admin" by adding the permission "academics.assign_subjects".
"""
from pymongo import MongoClient
import os
import sys


def dbname_from_uri(uri: str):
    try:
        parts = uri.split('://', 1)[-1]
        if '/' in parts:
            after = parts.split('/', 1)[1]
            db = after.split('?', 1)[0]
            return db or None
    except Exception:
        return None
    return None


def main():
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/khushi_school')
    dbname = dbname_from_uri(MONGO_URI) or os.getenv('MONGO_DB', 'khushi_school')

    client = MongoClient(MONGO_URI)
    db = client[dbname]

    role_name = os.getenv('ROLE_NAME', 'Admin')
    permission = os.getenv('PERMISSION', 'academics.assign_subjects')

    print(f"Using Mongo URI: {MONGO_URI}")
    print(f"Database: {dbname}")
    print(f"Role: {role_name}")
    print(f"Permission to add: {permission}")

    role = db.roles.find_one({'name': role_name})
    if not role:
        print(f"Role '{role_name}' not found in db.roles. Available roles:")
        for r in db.roles.find():
            print(' -', r.get('name'), 'permissions=', r.get('permissions'))
        sys.exit(1)

    perms = role.get('permissions', []) or []
    print('Current permissions:', perms)

    if permission in perms:
        print('Permission already present — nothing to do.')
        sys.exit(0)

    result = db.roles.update_one({'name': role_name}, {'$addToSet': {'permissions': permission}})
    if result.modified_count == 1:
        updated = db.roles.find_one({'name': role_name})
        print('Permission added. New permissions:', updated.get('permissions'))
        sys.exit(0)
    else:
        print('No documents modified. Please check permissions and try again.')
        sys.exit(2)


if __name__ == '__main__':
    main()
