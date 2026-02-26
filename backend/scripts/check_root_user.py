"""
Check Root User Status in MongoDB Atlas
"""

from pymongo import MongoClient

MONGO_URI = 'mongodb+srv://root:khushi-root-DB-%40%2A007@cluster0.zml92km.mongodb.net/'

def check_root_users():
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        root_db = client['saas_root_db']

        # Find all root users
        users = list(root_db.global_users.find({'email': 'root@edu'}))
        print(f'Found {len(users)} root@edu users:')
        print()

        for i, user in enumerate(users):
            print(f'User {i+1}:')
            print(f'  _id: {user.get("_id")}')
            print(f'  email: {user.get("email")}')
            print(f'  password: {user.get("password")}')
            print(f'  password_hash: {user.get("password_hash")}')
            print(f'  role: {user.get("role")}')
            print(f'  is_active: {user.get("is_active")}')
            print()

        client.close()
        return len(users)

    except Exception as e:
        print(f'Error: {e}')
        return 0

if __name__ == "__main__":
    check_root_users()