from pymongo import MongoClient
import os
MONGO_URI = os.getenv('MONGO_URI','mongodb://localhost:27017/khushi_SMS_db')

def dbname_from_uri(uri):
    if '/' in uri.split('://',1)[-1]:
        rest = uri.split('://',1)[-1]
        after = rest.split('/',1)[1] if '/' in rest else ''
        db = after.split('?',1)[0]
        return db or None
    return None

name = dbname_from_uri(MONGO_URI) or os.getenv('MONGO_DB','khushi_SMS_db')
client=MongoClient(MONGO_URI)
db=client[name]
print('Using DB:',name)
found=False
for u in db.users.find({'role':'Admin'}):
    print('Admin user:', u.get('email'), 'id=', str(u.get('_id')), 'school_id=', u.get('school_id'))
    found=True
if not found:
    print('No Admin users found. Sample users:')
    for u in db.users.find().limit(10):
        print(' -', u.get('email'), 'role=', u.get('role'))
