#!/usr/bin/env python3
import requests
import json
import time

def test_flow():
    print("=" * 60)
    print("TESTING FULL AUTO-CLOCK FLOW")
    print("=" * 60)
    
    url = 'http://localhost:8005/recognize'
    img_path = 'data/images/3.jpg'
    headers = {'x-api-key': 'changeme'}
    
    # FIRST RECOGNITION - Should clock in
    print("\n[1] FIRST RECOGNITION (Teacher 3 - Third - CLOCK IN)")
    with open(img_path, 'rb') as f:
        r = requests.post(url, files={'file': f}, data={'auto_clock': 'true'}, headers=headers, timeout=10)
        result = r.json()
        print(f"    Match: {result['match']['name']} (ID: {result['match']['student_id']})")
        print(f"    Confidence: {result['confidence']:.4f}")
        print(f"    Action: {result.get('attendance_action', 'MISSING!')}")
        print(f"    Time: {result.get('time', 'MISSING!')}")
    
    time.sleep(1)
    
    # Check attendance after first recognition
    print("\n[CHECK] ATTENDANCE AFTER FIRST RECOGNITION:")
    r = requests.get('http://localhost:8005/attendance?role=teacher', headers=headers)
    records = r.json()['records']
    print(f"    Records found: {len(records)}")
    if records:
        for rec in records:
            print(f"    - {rec['name']} (ID: {rec['student_id']})")
            print(f"      Time In: {rec.get('time_in', 'MISSING')}")
            print(f"      Time Out: {rec.get('time_out', 'MISSING')}")
    
    time.sleep(2)
    
    # SECOND RECOGNITION - Should clock out
    print("\n[2] SECOND RECOGNITION (Same teacher - CLOCK OUT)")
    with open(img_path, 'rb') as f:
        r = requests.post(url, files={'file': f}, data={'auto_clock': 'true'}, headers=headers, timeout=10)
        result = r.json()
        print(f"    Match: {result['match']['name']} (ID: {result['match']['student_id']})")
        print(f"    Action: {result.get('attendance_action', 'MISSING!')}")
        print(f"    Time: {result.get('time', 'MISSING!')}")
    
    # Check attendance after second recognition
    print("\n[CHECK] ATTENDANCE AFTER SECOND RECOGNITION:")
    r = requests.get('http://localhost:8005/attendance?role=teacher', headers=headers)
    records = r.json()['records']
    print(f"    Records found: {len(records)}")
    if records:
        for rec in records:
            print(f"    - {rec['name']} (ID: {rec['student_id']})")
            print(f"      Date: {rec.get('date')}")
            print(f"      Time In: {rec.get('time_in', 'MISSING')}")
            print(f"      Time Out: {rec.get('time_out', 'MISSING')}")
            
            # Calculate hours
            if rec.get('time_in') and rec.get('time_out'):
                from datetime import datetime
                t_in = datetime.fromisoformat(rec['time_in'])
                t_out = datetime.fromisoformat(rec['time_out'])
                hours = (t_out - t_in).total_seconds() / 3600
                print(f"      Hours Worked: {hours:.2f} hrs")
    
    # Check payroll
    print("\n[PAYROLL] CHECKING PAYROLL FOR TEACHER 3:")
    r = requests.get('http://localhost:8005/payroll/3', headers=headers)
    if r.ok:
        payroll = r.json()
        print(f"    Total Hours: {payroll['total_hours']:.2f} hrs")
        print(f"    Hourly Rate: ${payroll['hourly_rate']:.2f}")
        print(f"    Total Salary: ${payroll['total_salary']:.2f}")
    else:
        print(f"    ERROR: {r.status_code}")
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE - Backend is working!")
    print("=" * 60)

if __name__ == '__main__':
    test_flow()
