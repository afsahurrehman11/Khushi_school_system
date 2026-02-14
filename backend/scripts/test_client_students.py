from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print('Logging in as admin')
resp = client.post('/api/token', data={'username':'admin@school.edu','password':'admin123'})
print('login', resp.status_code)
print(resp.json())
if resp.status_code==200:
    token = resp.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    r = client.get('/api/classes', headers=headers)
    print('/api/classes', r.status_code, r.json()[:1])
    r2 = client.get('/api/students', headers=headers)
    print('/api/students', r2.status_code)
    try:
        print(len(r2.json()))
    except Exception as e:
        print('students json error', e)
else:
    print('login failed')
