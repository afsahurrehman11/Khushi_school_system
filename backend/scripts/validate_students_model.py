import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.services.student import get_all_students
from app.models.student import StudentInDB
import json

students = get_all_students()
print('Total students:', len(students))
from pydantic import ValidationError

for i, s in enumerate(students):
    try:
        StudentInDB(**s)
    except ValidationError as ve:
        print('ValidationError at student', i)
        print(ve.json())
        break
    except Exception as e:
        print('Other error at student', i, e)
        break
else:
    print('All students validated OK')
