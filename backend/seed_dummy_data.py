"""One-time idempotent seeder for dummy data used in development and testing.

Creates 2-3 realistic dummy records for: Classes, Subjects, Teachers (users), Students,
Grades and Fee records. Skips creation when an item already exists.

Run with: python backend/seed_dummy_data.py
"""
from database import get_db
from datetime import datetime
from bson.objectid import ObjectId

def ensure_role(db, name, description, permissions):
    r = db.roles.find_one({'name': name})
    if not r:
        role = {'name': name, 'description': description, 'permissions': permissions, 'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}
        db.roles.insert_one(role)
        print(f"Created role: {name}")
    else:
        print(f"Role exists: {name}")

def ensure_user(db, email, name, password, role):
    u = db.users.find_one({'email': email})
    if not u:
        user = {'email': email, 'name': name, 'password': password, 'role': role, 'is_active': True, 'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}
        db.users.insert_one(user)
        print(f"Created user: {email}")
    else:
        print(f"User exists: {email}")

def ensure_subject(db, subject_name, subject_code):
    s = db.subjects.find_one({'subject_code': subject_code})
    if not s:
        doc = {'subject_name': subject_name, 'subject_code': subject_code, 'assigned_class': None, 'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow()}
        db.subjects.insert_one(doc)
        print(f"Created subject: {subject_name} ({subject_code})")
    else:
        print(f"Subject exists: {subject_code}")

def ensure_class(db, class_name, section, assigned_subjects=None):
    cls = db.classes.find_one({'class_name': class_name, 'section': section})
    if not cls:
        doc = {
            'class_name': class_name,
            'section': section,
            'assigned_subjects': assigned_subjects or [],
            'assigned_teachers': [],
            'branch_code': 'MAIN',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.classes.insert_one(doc)
        print(f"Created class: {class_name} - {section}")
    else:
        print(f"Class exists: {class_name} - {section}")

def ensure_teacher_as_user(db, email, name, assigned_classes=None, assigned_subject_codes=None):
    # Ensure teacher user role exists
    ensure_user(db, email, name, 'teacherpass', 'Teacher')
    user = db.users.find_one({'email': email})
    teacher_doc = db.teachers.find_one({'user_email': email})
    if not teacher_doc:
        # Resolve subject ids
        subject_ids = []
        if assigned_subject_codes:
            for code in assigned_subject_codes:
                s = db.subjects.find_one({'subject_code': code})
                if s:
                    subject_ids.append(str(s['_id']))

        # Resolve class ids
        class_ids = []
        if assigned_classes:
            for cls in assigned_classes:
                c = db.classes.find_one({'class_name': cls[0], 'section': cls[1]})
                if c:
                    class_ids.append(str(c['_id']))

        tdoc = {
            'user_email': email,
            'name': name,
            'assigned_classes': class_ids,
            'assigned_subjects': subject_ids,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.teachers.insert_one(tdoc)
        print(f"Created teacher profile: {name} ({email})")
        # Attach teacher to classes assigned_teachers
        for cid in class_ids:
            db.classes.update_one({'_id': ObjectId(cid)}, {'$addToSet': {'assigned_teachers': email}})
    else:
        print(f"Teacher profile exists: {email}")

def ensure_student(db, older_reg_id, full_name, father_name, class_name, section, subject_codes):
    # registration_ID rule: 0000-<older registration ID>
    registration_id = f"0000-{older_reg_id}"
    existing = db.students.find_one({'student_id': registration_id})
    if existing:
        print(f"Student exists, skipping: {registration_id}")
        return existing

    # find class id
    cls = db.classes.find_one({'class_name': class_name, 'section': section})
    class_id = str(cls['_id']) if cls else None

    # resolve subject ids
    subject_ids = []
    for code in subject_codes:
        s = db.subjects.find_one({'subject_code': code})
        if s:
            subject_ids.append(str(s['_id']))

    doc = {
        'student_id': registration_id,
        'full_name': full_name,
        'guardian_info': {'father_name': father_name},
        'class_id': class_id,
        'section': section,
        'subjects': subject_ids,
        'branch_code': 'MAIN',
        'status': 'active',
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    db.students.insert_one(doc)
    print(f"Created student: {full_name} ({registration_id})")
    return doc

def ensure_grade(db, student_reg_id, subject_code, teacher_email, total_marks=100, obtained_marks=0):
    student = db.students.find_one({'student_id': student_reg_id})
    subject = db.subjects.find_one({'subject_code': subject_code})
    if not student or not subject:
        print(f"Skipping grade: missing student or subject ({student_reg_id}, {subject_code})")
        return

    existing = db.grades.find_one({'student_id': student_reg_id, 'subject_code': subject_code})
    if existing:
        print(f"Grade exists for {student_reg_id} - {subject_code}")
        return

    grade_doc = {
        'student_id': student_reg_id,
        'subject_id': str(subject['_id']),
        'subject_code': subject_code,
        'teacher_email': teacher_email,
        'total_marks': total_marks,
        'obtained_marks': obtained_marks,
        'percentage': (obtained_marks / total_marks * 100) if total_marks else 0,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    db.grades.insert_one(grade_doc)
    print(f"Created grade: {student_reg_id} - {subject_code} ({obtained_marks}/{total_marks})")

def ensure_fee(db, student_reg_id, fee_type='Tuition Fee', amount=10000, status='pending'):
    student = db.students.find_one({'student_id': student_reg_id})
    if not student:
        print(f"Skipping fee: student missing {student_reg_id}")
        return
    existing = db.fees.find_one({'student_id': student_reg_id, 'fee_type': fee_type})
    if existing:
        print(f"Fee exists for {student_reg_id} - {fee_type}")
        return
    fee = {
        'student_id': student_reg_id,
        'class_id': student.get('class_id'),
        'fee_type': fee_type,
        'amount': amount,
        'due_date': datetime.utcnow().strftime('%Y-%m-%d'),
        'status': status,
        'created_at': datetime.utcnow()
    }
    db.fees.insert_one(fee)
    print(f"Created fee for {student_reg_id}: {fee_type} {amount}")

def run():
    db = get_db()

    print('Starting dummy data seeding...')

    # Ensure roles
    ensure_role(db, 'Teacher', 'Teacher role', ['students.read', 'academics.view_classes', 'academics.assign_subjects'])
    ensure_role(db, 'Accountant', 'Accountant role', ['students.read', 'fees.manage', 'fees.view', 'accounting.dashboard_view'])

    # Ensure users (teachers and accountant)
    ensure_user(db, 't.alam@school.edu', 'Talha Alam', 'teacherpass', 'Teacher')
    ensure_user(db, 'm.sheikh@school.edu', 'Mina Sheikh', 'teacherpass', 'Teacher')
    ensure_user(db, 'acc@test.edu', 'Accountant Test', 'accpass', 'Accountant')

    # Ensure subjects
    ensure_subject(db, 'Mathematics', 'MATH101')
    ensure_subject(db, 'English', 'ENG101')
    ensure_subject(db, 'Science', 'SCI101')

    # Ensure classes (with subjects assigned)
    # Attach first subject ids to classes
    math = db.subjects.find_one({'subject_code': 'MATH101'})
    eng = db.subjects.find_one({'subject_code': 'ENG101'})
    sci = db.subjects.find_one({'subject_code': 'SCI101'})
    subj_ids = [str(x['_id']) for x in (math, eng, sci) if x]

    ensure_class(db, 'Grade 1', 'A', assigned_subjects=subj_ids)
    ensure_class(db, 'Grade 1', 'B', assigned_subjects=subj_ids)
    ensure_class(db, 'Grade 2', 'A', assigned_subjects=subj_ids)

    # Ensure teachers profiles and assignments
    ensure_teacher_as_user(db, 't.alam@school.edu', 'Talha Alam', assigned_classes=[('Grade 1','A')], assigned_subject_codes=['MATH101','ENG101'])
    ensure_teacher_as_user(db, 'm.sheikh@school.edu', 'Mina Sheikh', assigned_classes=[('Grade 1','B'),('Grade 2','A')], assigned_subject_codes=['SCI101'])

    # Ensure students (older registration IDs simulated)
    ensure_student(db, 'REG1001', 'Ali Khan', 'Mr. Khan', 'Grade 1', 'A', ['MATH101','ENG101'])
    ensure_student(db, 'REG1002', 'Fatima Ahmed', 'Mr. Ahmed', 'Grade 1', 'A', ['MATH101','SCI101'])
    ensure_student(db, 'REG2001', 'Omar Malik', 'Mr. Malik', 'Grade 1', 'B', ['ENG101','SCI101'])

    # Ensure grades
    ensure_grade(db, '0000-REG1001', 'MATH101', 't.alam@school.edu', total_marks=100, obtained_marks=88)
    ensure_grade(db, '0000-REG1002', 'MATH101', 't.alam@school.edu', total_marks=100, obtained_marks=92)
    ensure_grade(db, '0000-REG2001', 'ENG101', 'm.sheikh@school.edu', total_marks=100, obtained_marks=75)

    # Ensure fees
    ensure_fee(db, '0000-REG1001', 'Tuition Fee', 12000, status='pending')
    ensure_fee(db, '0000-REG1002', 'Tuition Fee', 12000, status='paid')
    ensure_fee(db, '0000-REG2001', 'Tuition Fee', 12000, status='pending')

    print('Seeding complete.')

if __name__ == '__main__':
    run()
