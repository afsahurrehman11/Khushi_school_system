import requests

BASE='http://127.0.0.1:8000'

print('Getting token for admin@school.edu')
resp = requests.post(BASE+'/api/token', data={'username':'admin@school.edu','password':'admin123'})
print('Token status:', resp.status_code)
print(resp.text)
if resp.status_code==200:
    token = resp.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.get(BASE+'/api/classes', headers=headers)
    print('/api/classes', r.status_code)
    try:
        print(r.json()[:2])
    except Exception as e:
        print('Could not parse classes json', e)
    r2 = requests.get(BASE+'/api/students', headers=headers)
    print('/api/students', r2.status_code)
    try:
           print(r2.text[:1000])
    except Exception as e:
        print('Could not parse students json', e)
else:
    print('Could not get token')
