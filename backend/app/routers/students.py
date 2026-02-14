from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.student import StudentSchema, StudentInDB, StudentUpdate
from app.services.student import (
    get_all_students, get_student_by_id, get_student_by_student_id,
    create_student, update_student, delete_student
)
from app.services.student import import_students_from_workbook_bytes, export_students_to_workbook_bytes, parse_students_from_workbook_bytes
from fastapi import UploadFile, File, Form
from fastapi.responses import StreamingResponse
from app.dependencies.auth import check_permission
from datetime import datetime

router = APIRouter()

@router.get("/students", response_model=List[StudentInDB])
async def get_students(
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get all students with optional filters"""
    filters = {}
    if class_id:
        filters["class_id"] = class_id
    if status:
        filters["status"] = status

    students = get_all_students(filters)
    return students

@router.get("/students/{student_id}", response_model=StudentInDB)
async def get_student(
    student_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get student by ID"""
    student = get_student_by_id(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

@router.get("/students/by-student-id/{student_id}", response_model=StudentInDB)
async def get_student_by_student_id_endpoint(
    student_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get student by student ID"""
    student = get_student_by_student_id(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

@router.post("/students", response_model=StudentInDB)
async def create_new_student(
    student_data: dict,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Create new student. Accepts partial payloads from admin and fills defaults when possible."""
    # Allow frontend to send simplified payloads (e.g., {name, roll, class})
    # Normalize keys to backend model
    data = dict(student_data)
    # map legacy 'name' -> 'full_name'
    if 'name' in data and 'full_name' not in data:
        data['full_name'] = data.pop('name')
    # map 'class' to 'class_id'
    if 'class' in data and 'class_id' not in data:
        data['class_id'] = data.pop('class')

    # Ensure student_id exists; generate one if missing
    if not data.get('student_id'):
        year = datetime.utcnow().year
        # create a simple unique id using timestamp
        data['student_id'] = f"STU{year}{int(datetime.utcnow().timestamp())}"

    # Fill minimal required fields with defaults if missing
    data.setdefault('full_name', 'Unnamed Student')
    data.setdefault('gender', 'Not specified')
    data.setdefault('date_of_birth', datetime.utcnow().strftime('%Y-%m-%d'))
    data.setdefault('admission_date', datetime.utcnow().strftime('%Y-%m-%d'))
    data.setdefault('section', data.get('section', 'A'))
    data.setdefault('roll_number', data.get('roll_number') or data.get('roll') or '')
    data.setdefault('subjects', data.get('subjects', []))
    data.setdefault('assigned_teacher_ids', data.get('assigned_teacher_ids', []))
    data.setdefault('status', data.get('status', 'active'))
    data.setdefault('academic_year', data.get('academic_year', f"{datetime.utcnow().year}-{datetime.utcnow().year+1}"))

    student = create_student(data)
    if not student:
        raise HTTPException(status_code=400, detail="Student with this ID already exists")
    return student


@router.post('/students/import')
async def import_students(
    class_id: str = Form(...),
    preview: bool = Form(False),
    file: UploadFile = File(...),
    current_user: dict = Depends(check_permission('students.write'))
):
    """Import students from uploaded Excel file. If preview=true, returns a preview of first rows without creating."""
    if file.content_type not in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'):
        raise HTTPException(status_code=400, detail='Invalid file type; please upload an Excel (.xlsx) file')

    content = await file.read()
    try:
        if preview:
            parsed = parse_students_from_workbook_bytes(content)
            return {'preview': parsed}
        created, errors = import_students_from_workbook_bytes(content, class_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {'created': created, 'errors': errors}


@router.get('/students/export')
async def export_students(
    class_id: Optional[str] = None,
    section: Optional[str] = None,
    current_user: dict = Depends(check_permission('students.read'))
):
    """Export students as Excel file"""
    filters = {}
    if class_id:
        filters['class_id'] = class_id
    if section:
        filters['section'] = section

    try:
        xlsx_bytes = export_students_to_workbook_bytes(filters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(iter([xlsx_bytes]), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={
        'Content-Disposition': 'attachment; filename="students_export.xlsx"'
    })

@router.put("/students/{student_id}", response_model=StudentInDB)
async def update_existing_student(
    student_id: str,
    student_data: StudentUpdate,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Update student"""
    update_data = student_data.dict(exclude_unset=True)
    student = update_student(student_id, **update_data)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

@router.delete("/students/{student_id}")
async def delete_existing_student(
    student_id: str,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Delete student"""
    if not delete_student(student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    return {"message": "Student deleted successfully"}