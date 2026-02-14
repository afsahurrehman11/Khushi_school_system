from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId
from io import BytesIO
from typing import List, Tuple

try:
    import openpyxl  # type: ignore[import]
    from openpyxl import Workbook  # type: ignore[import]
except Exception:
    openpyxl = None

# ================= Student Operations =================

def create_student(student_data: dict) -> Optional[dict]:
    """Create a new student"""
    db = get_db()

    if db.students.find_one({"student_id": student_data.get("student_id")}):
        return None

    student_data["created_at"] = datetime.utcnow()
    student_data["updated_at"] = datetime.utcnow()

    result = db.students.insert_one(student_data)
    student_data["_id"] = str(result.inserted_id)
    return student_data

def get_all_students(filters: dict = None) -> list:
    """Get all students with optional filters"""
    db = get_db()
    query = filters or {}
    students = list(db.students.find(query))
    for student in students:
        # ensure id string
        student["id"] = str(student["_id"])
        # normalize missing fields so Pydantic response models don't fail
        student.setdefault('full_name', 'Unnamed Student')
        student.setdefault('gender', 'Not specified')
        student.setdefault('date_of_birth', datetime.utcnow().strftime('%Y-%m-%d'))
        student.setdefault('admission_date', datetime.utcnow().strftime('%Y-%m-%d'))
        student.setdefault('roll_number', '')
        student.setdefault('academic_year', f"{datetime.utcnow().year}-{datetime.utcnow().year+1}")
        student.setdefault('subjects', student.get('subjects', []))
        student.setdefault('assigned_teacher_ids', student.get('assigned_teacher_ids', []))
        # ensure timestamps exist
        if 'created_at' not in student:
            student['created_at'] = datetime.utcnow()
        if 'updated_at' not in student:
            student['updated_at'] = datetime.utcnow()
    return students

def get_student_by_id(student_id: str) -> Optional[dict]:
    """Get student by ID"""
    db = get_db()
    try:
        student = db.students.find_one({"_id": ObjectId(student_id)})
        if student:
            student["id"] = str(student["_id"])
        return student
    except:
        return None

def get_student_by_student_id(student_id: str) -> Optional[dict]:
    """Get student by student_id field"""
    db = get_db()
    student = db.students.find_one({"student_id": student_id})
    if student:
        student["id"] = str(student["_id"])
    return student

def update_student(student_id: str, **kwargs) -> Optional[dict]:
    """Update student"""
    db = get_db()
    try:
        kwargs["updated_at"] = datetime.utcnow()
        result = db.students.find_one_and_update(
            {"_id": ObjectId(student_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None

def delete_student(student_id: str) -> bool:
    """Delete student"""
    db = get_db()
    try:
        result = db.students.delete_one({"_id": ObjectId(student_id)})
        return result.deleted_count > 0
    except:
        return False


# ---------------- Import / Export Helpers ----------------
def import_students_from_workbook_bytes(xlsx_bytes: bytes, class_id: str) -> Tuple[List[dict], List[dict]]:
    """Parse xlsx bytes, create students, return (created, errors)

    Expected columns (case-insensitive): name, father_name, parent_cnic, registration_ID, fathers_NIC, section, subjects
    """
    if openpyxl is None:
        raise RuntimeError('openpyxl not installed')

    wb = openpyxl.load_workbook(filename=BytesIO(xlsx_bytes), read_only=True)
    ws = wb.active

    created = []
    errors = []

    # read header
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return created, [{'row': 0, 'error': 'Empty workbook'}]

    header = [str(c).strip() if c is not None else '' for c in rows[0]]
    # map expected columns
    col_map = {}
    for idx, col in enumerate(header):
        key = col.strip().lower()
        col_map[key] = idx

    required_keys = ['name', 'father_name', 'parent_cnic', 'registration_id']
    for rk in required_keys:
        if rk not in col_map:
            return created, [{'row': 0, 'error': f'Missing required column: {rk}'}]

    for r_idx, row in enumerate(rows[1:], start=2):
        try:
            # read values safely
            def val(k):
                i = col_map.get(k)
                return str(row[i]).strip() if i is not None and row[i] is not None else ''

            name = val('name')
            father_name = val('father_name')
            parent_cnic = val('parent_cnic')
            older_reg = val('registration_id')
            fathers_nic = val('fathers_nic')
            section = val('section') or ''
            subjects_raw = val('subjects')
            subjects = [s.strip() for s in subjects_raw.split(',')] if subjects_raw else []

            if not name or not older_reg:
                errors.append({'row': r_idx, 'error': 'Missing required name or registration_ID'})
                continue

            if not parent_cnic:
                errors.append({'row': r_idx, 'error': 'Missing required parent_cnic'})
                continue

            student_id = f"0000-{older_reg}"

            # skip duplicates
            if get_student_by_student_id(student_id):
                errors.append({'row': r_idx, 'error': 'Duplicate registration_ID, skipped', 'registration_id': student_id})
                continue

            student_doc = {
                'student_id': student_id,
                'full_name': name,
                'class_id': class_id,
                'section': section,
                'subjects': subjects,
                'guardian_info': {
                    'parent_cnic': parent_cnic,
                    'father_name': father_name,
                    'fathers_NIC': fathers_nic,
                }
            }

            res = create_student(student_doc)
            if res is None:
                errors.append({'row': r_idx, 'error': 'Failed to create (duplicate?)', 'registration_id': student_id})
            else:
                created.append(res)
        except Exception as e:
            errors.append({'row': r_idx, 'error': str(e)})

    return created, errors


def parse_students_from_workbook_bytes(xlsx_bytes: bytes, max_preview: int = 10) -> List[dict]:
    """Parse xlsx bytes and return up to max_preview parsed rows (no DB writes)."""
    if openpyxl is None:
        raise RuntimeError('openpyxl not installed')

    wb = openpyxl.load_workbook(filename=BytesIO(xlsx_bytes), read_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header = [str(c).strip() if c is not None else '' for c in rows[0]]
    col_map = {col.strip().lower(): idx for idx, col in enumerate(header)}

    parsed = []
    for r_idx, row in enumerate(rows[1:1+max_preview], start=2):
        def val(k):
            i = col_map.get(k)
            return str(row[i]).strip() if i is not None and row[i] is not None else ''

        parsed.append({
            'row': r_idx,
            'name': val('name'),
            'father_name': val('father_name'),
            'parent_cnic': val('parent_cnic'),
            'registration_ID': val('registration_id'),
            'fathers_NIC': val('fathers_nic'),
            'section': val('section'),
            'subjects': [s.strip() for s in (val('subjects') or '').split(',') if s.strip()]
        })
    return parsed


def export_students_to_workbook_bytes(filters: dict = None) -> bytes:
    """Export students matching filters to xlsx bytes"""
    if openpyxl is None:
        raise RuntimeError('openpyxl not installed')

    students = get_all_students(filters or {})

    wb = Workbook()
    ws = wb.active
    ws.title = 'Students'

    header = ['name', 'father_name', 'parent_cnic', 'registration_ID', 'fathers_NIC', 'class', 'section', 'subjects']
    ws.append(header)

    for s in students:
        name = s.get('full_name') or s.get('name') or ''
        guardian = s.get('guardian_info') or {}
        father_name = guardian.get('father_name', '')
        parent_cnic = guardian.get('parent_cnic', '')
        fathers_nic = guardian.get('fathers_NIC', '')
        reg = s.get('student_id') or ''
        class_name = s.get('class') or s.get('class_id') or ''
        section = s.get('section') or ''
        subjects = ','.join(s.get('subjects') or [])
        ws.append([name, father_name, parent_cnic, reg, fathers_nic, class_name, section, subjects])

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read()