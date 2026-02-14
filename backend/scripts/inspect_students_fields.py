import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database import get_db
from bson import json_util
import json

db = get_db()
print('Students count:', db.students.count_documents({}))
for i, s in enumerate(db.students.find().limit(10)):
    print('--- student', i)
    print(json.dumps(json.loads(json_util.dumps(s)), indent=2))
