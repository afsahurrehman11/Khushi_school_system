import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database import get_db
from bson import json_util
import json

db = get_db()
collections = ['students','teachers','classes','subjects']
print('Running DB inspect...')
for c in collections:
    try:
        count = db[c].count_documents({})
        sample = db[c].find_one({})
        print('--- %s count: %s ---' % (c,count))
        if sample:
            print(json.dumps(json.loads(json_util.dumps(sample)), indent=2) )
        else:
            print('no sample doc')
    except Exception as e:
        print('Error reading %s: %s' % (c,e))
