"""
DB inspection helper for local use.
Usage:
  .venv\Scripts\python.exe backend\tools\inspect_db.py

It imports `app.config.settings` to pick up `mongo_uri` and `database_name` from your project.
The script lists collections, samples documents, and prints field names with inferred types.
"""
import sys
import os
import json
from collections import defaultdict

# make backend package importable when running from repo root
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

try:
    from app.config import settings
except Exception as e:
    print('Failed to import app.config.settings:', e)
    print('You can also set MONGO_URI and DATABASE_NAME environment variables and re-run.')
    settings = None

MONGO_URI = os.environ.get('MONGO_URI') or (getattr(settings, 'mongo_uri', None) if settings else None) or 'mongodb://localhost:27017'
DATABASE_NAME = os.environ.get('DATABASE_NAME') or (getattr(settings, 'database_name', None) if settings else 'cms_db')

print(f'Using Mongo URI: {MONGO_URI}')
print(f'Using database name: {DATABASE_NAME}')

try:
    from pymongo import MongoClient
except ImportError:
    print('pymongo not installed. Install with: pip install pymongo')
    raise

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

COLLECTION_SAMPLE_LIMIT = 100

# helper to map Python values to a short type name
def short_type(v):
    import datetime
    from bson.objectid import ObjectId
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'bool'
    if isinstance(v, int) and not isinstance(v, bool):
        return 'int'
    if isinstance(v, float):
        return 'float'
    if isinstance(v, str):
        return 'string'
    if isinstance(v, list):
        return 'array'
    if isinstance(v, dict):
        return 'object'
    if isinstance(v, datetime.datetime):
        return 'datetime'
    if isinstance(v, ObjectId):
        return 'objectId'
    return type(v).__name__


def merge_types(t1, t2):
    s = set()
    if isinstance(t1, (list, set)):
        s.update(t1)
    else:
        s.add(t1)
    if isinstance(t2, (list, set)):
        s.update(t2)
    else:
        s.add(t2)
    return sorted(s)


def analyze_collection(coll_name):
    coll = db[coll_name]
    cursor = coll.find().limit(COLLECTION_SAMPLE_LIMIT)

    field_types = defaultdict(set)
    sample_docs = []
    count = 0
    for doc in cursor:
        sample_docs.append(doc)
        count += 1
        for k, v in doc.items():
            t = short_type(v)
            if t == 'array':
                # inspect element types
                elem_types = set()
                for e in (v or [])[:10]:
                    elem_types.add(short_type(e))
                field_types[k].add(f'array[{"|".join(sorted(elem_types))}]' if elem_types else 'array')
            else:
                field_types[k].add(t)

    # convert sets to sorted lists
    field_summary = {k: sorted(list(s)) for k, s in field_types.items()}
    return {
        'collection': coll_name,
        'sample_count': count,
        'fields': field_summary,
        'example_doc': (sample_docs[0] if sample_docs else None)
    }


def main():
    try:
        collections = db.list_collection_names()
    except Exception as e:
        print('Failed to list collections:', e)
        return

    print(f'Found {len(collections)} collections: {collections}')

    results = []
    for c in collections:
        print('\nAnalyzing', c)
        try:
            info = analyze_collection(c)
            results.append(info)
            # print concise fields
            for fld, types in info['fields'].items():
                print(f' - {fld}: {"|".join(types)}')
        except Exception as e:
            print(' Error analyzing collection', c, e)

    # persist to JSON for review
    out_path = os.path.join(os.path.dirname(__file__), 'db_schema_report.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, default=str, indent=2)
    print(f'\nWrote report to {out_path}')

if __name__ == '__main__':
    main()
