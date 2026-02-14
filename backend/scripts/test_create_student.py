import json
from urllib import request, parse

BASE = 'http://localhost:8000'

# obtain token
data = parse.urlencode({'username':'admin@school.edu','password':'admin123'}).encode()
req = request.Request(BASE + '/api/token', data=data, method='POST')
req.add_header('Content-Type','application/x-www-form-urlencoded')
resp = request.urlopen(req)
res = json.load(resp)
print('Token response keys:', list(res.keys()))
token = res['access_token']

# create student minimal payload
payload = json.dumps({'name':'Test Student X','roll':'999','class':'Grade 1'}).encode()
req2 = request.Request(BASE + '/api/students', data=payload, method='POST')
req2.add_header('Content-Type','application/json')
req2.add_header('Authorization', f'Bearer {token}')
resp2 = request.urlopen(req2)
res2 = json.load(resp2)
print('Create student response:', json.dumps(res2, indent=2))
