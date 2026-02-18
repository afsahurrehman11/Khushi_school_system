import os
from pymongo import MongoClient
from datetime import datetime
import random
from bson.objectid import ObjectId

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/khushi_SMS_db')
client = MongoClient(MONGO_URI)

# determine db name
from urllib.parse import urlparse

def dbname_from_uri(uri):
    if '/' in uri.split('://',1)[-1]:
        rest = uri.split('://',1)[-1]
        after = rest.split('/',1)[1] if '/' in rest else ''
        db = after.split('?',1)[0]
        return db or None
    return None

name = dbname_from_uri(MONGO_URI) or os.getenv('MONGO_DB', 'khushi_SMS_db')
db = client[name]

# pick a school id (use the admin school from logs)
school_id = os.getenv('SEED_SCHOOL_ID', '69958aa9ed615616f4b16f05')
min_count = int(os.getenv('SEED_COUNT', '15'))

existing = db.teachers.count_documents({'school_id': school_id})
print('Existing teachers for', school_id, existing)

now = datetime.utcnow()

# Ensure there are classes to assign to. If none exist for the school, create sample classes.
classes = list(db.classes.find({'school_id': school_id}))
if not classes:
    sample = []
    for g in range(1, 6):
        sample.append({
            'school_id': school_id,
            'name': f'Grade {g}',
            'grade': str(g),
            'created_at': now,
            'updated_at': now
        })
    try:
        ins = db.classes.insert_many(sample)
        classes = list(db.classes.find({'_id': {'$in': ins.inserted_ids}}))
        print('Created sample classes:', len(classes))
    except Exception as e:
        print('Failed to create sample classes:', e)
        classes = list(db.classes.find({'school_id': school_id}))

class_ids = [str(c.get('_id')) for c in classes]

docs = []
for i in range(1, min_count+1):
    email = f'teacher{i}@{school_id}.local'
    # skip if exists
    if db.teachers.find_one({'school_id': school_id, 'email': email}):
        continue

    # Generate a unique synthetic CNIC to avoid unique-index collisions
    cnic = f'SEED-{school_id}-{i}'

    # Assign 1-3 random classes from available class ids
    assigned = []
    if class_ids:
        k = random.randint(1, min(3, len(class_ids)))
        assigned = random.sample(class_ids, k)

    docs.append({
        'school_id': school_id,
        'name': f'Teacher {i}',
        'email': email,
        'cnic': cnic,
        'qualification': 'B.Ed',
        'assigned_classes': assigned,
        'assigned_subjects': [],
        'created_at': now,
        'updated_at': now
    })

if docs:
    try:
        res = db.teachers.insert_many(docs, ordered=False)
        print('Inserted', len(res.inserted_ids))
    except Exception as e:
        print('Insert error:', e)
else:
    print('No new docs to insert')

print('Final count:', db.teachers.count_documents({'school_id': school_id}))
