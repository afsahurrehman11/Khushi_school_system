#!/usr/bin/env python3
import requests
import json
import time

# First recognition (clock-in)
print("=" * 60)
print("TEST 1: First recognition (should CLOCK IN)")
print("=" * 60)

with open('data/images/1.jpg', 'rb') as f:
    files = {'file': f}
    data = {'auto_clock': 'true'}
    headers = {'x-api-key': 'changeme'}
    
    r = requests.post('http://localhost:8002/recognize', files=files, data=data, headers=headers)
    print(f"Status: {r.status_code}")
    result = r.json()
    print(json.dumps(result, indent=2))

# Check attendance.json
print("\nAttendance records after first recognition:")
with open('data/attendance.json', 'r') as f:
    records = json.load(f)
    print(json.dumps(records, indent=2))

# Wait a moment
time.sleep(2)

# Second recognition (clock-out)
print("\n" + "=" * 60)
print("TEST 2: Second recognition (should CLOCK OUT)")
print("=" * 60)

with open('data/images/1.jpg', 'rb') as f:
    files = {'file': f}
    data = {'auto_clock': 'true'}
    headers = {'x-api-key': 'changeme'}
    
    r = requests.post('http://localhost:8002/recognize', files=files, data=data, headers=headers)
    print(f"Status: {r.status_code}")
    result = r.json()
    print(json.dumps(result, indent=2))

# Check attendance.json
print("\nAttendance records after second recognition:")
with open('data/attendance.json', 'r') as f:
    records = json.load(f)
    print(json.dumps(records, indent=2))

# Check payroll
print("\n" + "=" * 60)
print("TEST 3: Payroll calculation")
print("=" * 60)

r = requests.get('http://localhost:8002/payroll/1', headers=headers)
print(f"Status: {r.status_code}")
payroll = r.json()
print(json.dumps(payroll, indent=2))
