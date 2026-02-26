"""
MongoDB Authentication Test Script

Usage:
  python scripts/test_mongo_auth.py \
    --host cluster0.zml92km.mongodb.net \
    --username root \
    --password "yourRawPasswordHere" \
    --dbname khushi_school

This script will try several URI encodings (raw and URL-encoded) and
report which form (if any) connects successfully.

Note: Quote the URI/password in PowerShell if it contains special characters.
"""

import argparse
from urllib.parse import quote_plus
from pymongo import MongoClient
import sys


def try_uri(uri):
    print('\nTrying URI:')
    print(uri if len(uri) < 300 else uri[:300] + '...')
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print('  ✅ Connected!')
        client.close()
        return True
    except Exception as e:
        print(f'  ❌ Failed: {e}')
        return False


def try_explicit(host, username, password, dbname):
    print('\nTrying explicit MongoClient(host, username, password)')
    try:
        client = MongoClient(host, username=username, password=password, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print('  ✅ Connected!')
        client.close()
        return True
    except Exception as e:
        print(f'  ❌ Failed: {e}')
        return False


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--host', required=True, help='Mongo host (SRV host or host:port)')
    p.add_argument('--username', required=True)
    p.add_argument('--password', required=True)
    p.add_argument('--dbname', default='admin')
    args = p.parse_args()

    host = args.host
    user = args.username
    raw = args.password
    db = args.dbname

    # 1) SRV with raw password
    uri1 = f"mongodb+srv://{user}:{raw}@{host}/{db}?retryWrites=true&w=majority"
    ok1 = try_uri(uri1)

    # 2) SRV with quote_plus encoded password
    enc = quote_plus(raw)
    uri2 = f"mongodb+srv://{user}:{enc}@{host}/{db}?retryWrites=true&w=majority"
    ok2 = try_uri(uri2)

    # 3) Standard mongodb:// with encoded password
    uri3 = f"mongodb://{user}:{enc}@{host}/{db}?retryWrites=true&w=majority"
    ok3 = try_uri(uri3)

    # 4) Try explicit connection parameters (non-SRV host may be required)
    ok4 = try_explicit(host, user, raw, db)

    print('\nSummary:')
    print(f'  SRV raw password:     {"OK" if ok1 else "FAIL"}')
    print(f'  SRV encoded password: {"OK" if ok2 else "FAIL"}')
    print(f'  mongodb:// encoded:   {"OK" if ok3 else "FAIL"}')
    print(f'  explicit connect:     {"OK" if ok4 else "FAIL"}')

    if not any((ok1, ok2, ok3, ok4)):
        print('\nIf all failed:')
        print(' - Verify Atlas user/password in MongoDB Atlas > Database Access')
        print(' - Ensure the user has the correct role for the target database')
        print(' - If password contains special chars, use the encoded form in Render (quote_plus)')
        print(' - As a last resort, reset the Atlas user password to a simple value (no special chars) and try again')
        sys.exit(2)

if __name__ == "__main__":
    main()
