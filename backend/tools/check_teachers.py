import os
from pymongo import MongoClient
from bson.objectid import ObjectId

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/khushi_SMS_db')
client = MongoClient(MONGO_URI)
# determine db name from URI or default
from urllib.parse import urlparse

def dbname_from_uri(uri):
    if '/' in uri.split('://',1)[-1]:
        rest = uri.split('://',1)[-1]
        after = rest.split('/',1)[1] if '/' in rest else ''
        db = after.split('?',1)[0]
        return db or None
    return None

name = dbname_from_uri(MONGO_URI) or os.getenv('MONGO_DB', 'khushi_SMS_db')
print('Using DB:', name)
db = client[name]

# list schools
if 'schools' in db.list_collection_names():
    for s in db.schools.find():
        sid = str(s.get('_id'))
        count = db.teachers.count_documents({'school_id': sid})
        print(f"School {sid}: teachers={count}")
        if count > 0:
            print('Sample teachers:')
            for t in db.teachers.find({'school_id': sid}).limit(10):
                print(' -', t.get('name'), t.get('email'), 'created_at:', t.get('created_at'))
else:
    # fallback: count all teachers
    total = db.teachers.count_documents({})
    print('No schools collection; total teachers:', total)
    if total > 0:
        print('Sample teachers (global):')
        for t in db.teachers.find().limit(20):
            print(' -', t.get('school_id'), t.get('name'), t.get('email'))
