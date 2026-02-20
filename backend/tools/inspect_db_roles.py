"""
Inspect roles and collections in the configured MongoDB for debugging.

Usage: python inspect_db_roles.py
"""
from pymongo import MongoClient
import os


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

    print('Using Mongo URI:', MONGO_URI)
    print('Database:', dbname)
    print('\nCollections:')
    try:
        cols = db.list_collection_names()
        for c in cols:
            print(' -', c)
    except Exception as e:
        print('Failed to list collections:', e)

    print('\nSample roles (db.roles):')
    try:
        for r in db.roles.find().limit(20):
            print(' -', r.get('name'), '->', r.get('permissions'))
    except Exception as e:
        print('roles find failed:', e)

    print('\nSample role-like collections:')
    # try common alternatives
    for alt in ['role', 'roles', 'user_roles', 'permissions']:
        if alt in cols:
            print(f"\nDocs in {alt}:")
            try:
                for d in db[alt].find().limit(10):
                    print('  -', d)
            except Exception as e:
                print('  failed:', e)

    print('\nCheck Admin user doc:')
    try:
        u = db.users.find_one({'email': 'admin@edu'})
        print(u)
    except Exception as e:
        print('users find failed:', e)


if __name__ == '__main__':
    main()
