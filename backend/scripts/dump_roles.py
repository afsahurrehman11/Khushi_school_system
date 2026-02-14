import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database import get_db
import json
from bson import json_util

db = get_db()
print('ROLES:')
for r in db.roles.find({}):
    print(json.dumps(json.loads(json_util.dumps(r)), indent=2))

print('\nADMIN USER:')
admin = db.users.find_one({'email':'admin@school.edu'})
print(json.dumps(json.loads(json_util.dumps(admin)), indent=2))
