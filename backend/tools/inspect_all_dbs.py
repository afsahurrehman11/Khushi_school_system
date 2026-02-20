"""
Inspect all databases on the Mongo server for roles and the admin user.

Usage: python inspect_all_dbs.py
"""
from pymongo import MongoClient
import os


def main():
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
    client = MongoClient(MONGO_URI)
    try:
        dbs = client.list_database_names()
    except Exception as e:
        print('Failed to list DBs:', e)
        return

    print('Mongo URI:', MONGO_URI)
    print('Found DBs:', dbs)

    target_user_email = 'admin@edu'
    for dbname in dbs:
        # skip internal dbs
        if dbname in ('admin', 'local', 'config'): continue
        db = client[dbname]
        cols = db.list_collection_names()
        roles_exists = 'roles' in cols or 'role' in cols
        users_exists = 'users' in cols
        print('\nDB:', dbname, 'collections count:', len(cols))
        if roles_exists:
            print(' - roles-like collections present')
            try:
                found = False
                for r in db.roles.find().limit(5):
                    print('   role:', r.get('name'), 'perms=', r.get('permissions'))
                    found = True
                if not found and 'role' in cols:
                    for r in db.role.find().limit(5):
                        print('   role:', r)
            except Exception as e:
                print('   roles read failed:', e)
        if users_exists:
            try:
                u = db.users.find_one({'email': target_user_email})
                if u:
                    print(' - Found admin user in db', dbname, ':', u)
                else:
                    print(' - No admin@edu user in db', dbname)
            except Exception as e:
                print(' - users read failed:', e)

if __name__ == '__main__':
    main()
