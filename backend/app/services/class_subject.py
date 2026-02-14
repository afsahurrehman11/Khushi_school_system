from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId

# ================= Subject Operations =================

def create_subject(subject_name: str, subject_code: str = None, assigned_classes: list = None) -> Optional[dict]:
    """Create a new subject. Accepts multiple assigned_classes entries."""
    db = get_db()

    if subject_code and db.subjects.find_one({"subject_code": subject_code}):
        return None

    # Normalize assigned_classes entries
    norm = []
    for a in (assigned_classes or []):
        if not a:
            continue
        if isinstance(a, dict):
            norm.append({
                'class_name': a.get('class_name') or a.get('class') or None,
                'section': a.get('section') or None,
                'teacher_id': a.get('teacher_id') or a.get('teacher') or None,
                'time': a.get('time') or None,
            })
        else:
            # unsupported shape, coerce to class_name string
            norm.append({'class_name': str(a)})

    # Enrich normalized assignments with teacher_name when teacher_id present
    for item in norm:
        tid = item.get('teacher_id')
        if tid:
            # try several lookup strategies
            tdoc = None
            # direct id match
            tdoc = db.teachers.find_one({'_id': ObjectId(tid)}) if isinstance(tid, str) and len(tid) == 24 else None
            if not tdoc:
                tdoc = db.teachers.find_one({'_id': tid}) if tid and not isinstance(tid, str) else tdoc
            if not tdoc:
                tdoc = db.teachers.find_one({'teacherId': tid})
            if not tdoc:
                tdoc = db.teachers.find_one({'id': tid})
            if not tdoc:
                tdoc = db.teachers.find_one({'cnic': tid})
            if tdoc:
                item['teacher_name'] = (tdoc.get('name') or tdoc.get('fullName') or tdoc.get('teacherId') or tdoc.get('cnic'))

    subject = {
        "subject_name": subject_name,
        "subject_code": subject_code,
        "assigned_classes": norm,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.subjects.insert_one(subject)
    subject["_id"] = str(result.inserted_id)
    # return enriched subject
    return get_subject_by_id(str(result.inserted_id))

def get_all_subjects() -> list:
    """Get all subjects"""
    db = get_db()
    subjects = list(db.subjects.find())

    # build maps for classes and teachers
    class_map = { str(c.get('_id')): (c.get('class_name') or c.get('name')) for c in db.classes.find() }
    # also map by class_name+section to preserve legacy matching
    name_section_map = {}
    for c in db.classes.find():
        key = f"{c.get('class_name')}::{c.get('section')}"
        name_section_map[key] = (c.get('class_name') or c.get('name'))

    # build teacher map using multiple possible id keys to make resolution robust
    teacher_map = {}
    for t in db.teachers.find():
        display = (t.get('name') or t.get('fullName') or t.get('teacherId') or t.get('cnic'))
        if display:
            if t.get('_id') is not None:
                teacher_map[str(t.get('_id'))] = display
            if t.get('id'):
                teacher_map[str(t.get('id'))] = display
            if t.get('teacherId'):
                teacher_map[str(t.get('teacherId'))] = display
            if t.get('cnic'):
                teacher_map[str(t.get('cnic'))] = display

    for subject in subjects:
        subject["id"] = str(subject["_id"])
        raw = subject.get('assigned_classes', [])
        enriched = []
        for a in (raw or []):
            if not a:
                continue
            cls_name = a.get('class_name') or a.get('class')
            section = a.get('section')
            teacher_id = a.get('teacher_id') or a.get('teacher')
            time = a.get('time')

            # try to resolve class display name
            display_class = None
            if cls_name:
                # try key match
                k = f"{cls_name}::{section}"
                display_class = name_section_map.get(k) or cls_name

            teacher_name = None
            if teacher_id:
                teacher_name = teacher_map.get(str(teacher_id))
                if not teacher_name:
                    try:
                        tdoc = db.teachers.find_one({"_id": ObjectId(str(teacher_id))})
                        if tdoc:
                            teacher_name = (tdoc.get('name') or tdoc.get('fullName') or tdoc.get('teacherId') or tdoc.get('cnic'))
                    except:
                        pass

            enriched.append({
                'class_name': cls_name,
                'section': section,
                'class_display': display_class,
                'teacher_id': teacher_id,
                'teacher_name': teacher_name,
                'time': time
            })

        subject['assigned_classes'] = enriched

    return subjects

def get_subject_by_id(subject_id: str) -> Optional[dict]:
    """Get subject by ID"""
    db = get_db()
    try:
        subject = db.subjects.find_one({"_id": ObjectId(subject_id)})
        if not subject:
            return None

        subject["id"] = str(subject["_id"])

        # enrich similar to get_all_subjects
        # build robust teacher map again
        teacher_map = {}
        for t in db.teachers.find():
            display = (t.get('name') or t.get('fullName') or t.get('teacherId') or t.get('cnic'))
            if display:
                if t.get('_id') is not None:
                    teacher_map[str(t.get('_id'))] = display
                if t.get('id'):
                    teacher_map[str(t.get('id'))] = display
                if t.get('teacherId'):
                    teacher_map[str(t.get('teacherId'))] = display
                if t.get('cnic'):
                    teacher_map[str(t.get('cnic'))] = display
        name_section_map = {}
        for c in db.classes.find():
            key = f"{c.get('class_name')}::{c.get('section')}"
            name_section_map[key] = (c.get('class_name') or c.get('name'))

        raw = subject.get('assigned_classes', [])
        enriched = []
        for a in (raw or []):
            if not a:
                continue
            cls_name = a.get('class_name') or a.get('class')
            section = a.get('section')
            teacher_id = a.get('teacher_id') or a.get('teacher')
            time = a.get('time')
            k = f"{cls_name}::{section}"
            display_class = name_section_map.get(k) or cls_name
            teacher_name = None
            if teacher_id:
                teacher_name = teacher_map.get(str(teacher_id))
                if not teacher_name:
                    try:
                        tdoc = db.teachers.find_one({"_id": ObjectId(str(teacher_id))})
                        if tdoc:
                            teacher_name = (tdoc.get('name') or tdoc.get('fullName') or tdoc.get('teacherId') or tdoc.get('cnic'))
                    except:
                        pass
            enriched.append({ 'class_name': cls_name, 'section': section, 'class_display': display_class, 'teacher_id': teacher_id, 'teacher_name': teacher_name, 'time': time })

        subject['assigned_classes'] = enriched
        return subject
    except:
        return None

def update_subject(subject_id: str, subject_name: str = None, subject_code: str = None, assigned_classes: list = None) -> Optional[dict]:
    """Update an existing subject and return the updated/enriched document."""
    db = get_db()
    try:
        oid = ObjectId(subject_id)
    except:
        return None

    update = {}
    if subject_name is not None:
        update['subject_name'] = subject_name
    if subject_code is not None:
        update['subject_code'] = subject_code
    if assigned_classes is not None:
        # normalize similar to create_subject
        norm = []
        for a in (assigned_classes or []):
            if not a:
                continue
            if isinstance(a, dict):
                norm.append({
                    'class_name': a.get('class_name') or a.get('class') or None,
                    'section': a.get('section') or None,
                    'teacher_id': a.get('teacher_id') or a.get('teacher') or None,
                    'time': a.get('time') or None,
                })
            else:
                norm.append({'class_name': str(a)})
        # Enrich normalized assignments with teacher_name when possible
        for item in norm:
            tid = item.get('teacher_id')
            if tid:
                tdoc = None
                try:
                    if isinstance(tid, str) and len(tid) == 24:
                        tdoc = db.teachers.find_one({'_id': ObjectId(tid)})
                except:
                    tdoc = None
                if not tdoc:
                    tdoc = db.teachers.find_one({'teacherId': tid}) or db.teachers.find_one({'id': tid}) or db.teachers.find_one({'cnic': tid})
                if tdoc:
                    item['teacher_name'] = (tdoc.get('name') or tdoc.get('fullName') or tdoc.get('teacherId') or tdoc.get('cnic'))
        update['assigned_classes'] = norm

    if not update:
        return get_subject_by_id(subject_id)

    update['updated_at'] = datetime.utcnow()
    res = db.subjects.update_one({'_id': oid}, {'$set': update})
    if res.matched_count == 0:
        return None
    return get_subject_by_id(subject_id)


def delete_subject(subject_id: str) -> bool:
    db = get_db()
    try:
        oid = ObjectId(subject_id)
    except:
        return False
    res = db.subjects.delete_one({'_id': oid})
    return res.deleted_count > 0

# ================= Class Operations =================

def create_class(class_name: str, section: str, assigned_subjects: list = None, assigned_teachers: list = None) -> Optional[dict]:
    """Create a new class"""
    db = get_db()

    if db.classes.find_one({"class_name": class_name, "section": section}):
        return None

    # normalize assigned_subjects: accept list of ids or list of dicts
    norm_assigned = []
    for a in (assigned_subjects or []):
        if not a:
            continue
        if isinstance(a, str):
            norm_assigned.append({"subject_id": a})
        elif isinstance(a, dict):
            norm_assigned.append({
                "subject_id": a.get("subject_id") or a.get("subject") or None,
                "teacher_id": a.get("teacher_id") or a.get("teacher") or None,
                "time": a.get("time") or None,
            })
        else:
            # fallback to string coercion
            norm_assigned.append({"subject_id": str(a)})

    cls = {
        "class_name": class_name,
        "section": section,
        "assigned_subjects": norm_assigned,
        "assigned_teachers": assigned_teachers or [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.classes.insert_one(cls)
    cls["_id"] = str(result.inserted_id)
    return cls

def get_all_classes() -> list:
    """Get all classes"""
    db = get_db()
    classes = list(db.classes.find())

    # build lookup maps for subjects and teachers
    subject_map = { str(s.get('_id')): (s.get('subject_name') or s.get('name') or s.get('subject_code')) for s in db.subjects.find() }
    teacher_map = { str(t.get('_id')): (t.get('name') or t.get('fullName') or t.get('teacherId') or t.get('cnic')) for t in db.teachers.find() }

    for cls in classes:
        cls["id"] = str(cls["_id"])
        raw = cls.get('assigned_subjects', [])
        assignments = []
        for a in (raw or []):
            if not a:
                continue
            if isinstance(a, str):
                sid = a
                tid = None
                time = None
            elif isinstance(a, dict):
                sid = a.get('subject_id') or a.get('subject')
                tid = a.get('teacher_id') or a.get('teacher')
                time = a.get('time')
            else:
                sid = str(a); tid = None; time = None

            subject_name = subject_map.get(str(sid)) if sid else None
            teacher_name = teacher_map.get(str(tid)) if tid else None

            assignments.append({
                'subject_id': sid,
                'subject_name': subject_name,
                'teacher_id': tid,
                'teacher_name': teacher_name,
                'time': time
            })

        cls['assigned_subjects'] = assignments

    return classes

def get_class_by_id(class_id: str) -> Optional[dict]:
    """Get class by ID"""
    db = get_db()
    try:
        cls = db.classes.find_one({"_id": ObjectId(class_id)})
        if not cls:
            return None

        cls["id"] = str(cls["_id"])
        # enrich assignments
        subject_map = { str(s.get('_id')): (s.get('subject_name') or s.get('name') or s.get('subject_code')) for s in db.subjects.find() }
        teacher_map = { str(t.get('_id')): (t.get('name') or t.get('fullName') or t.get('teacherId') or t.get('cnic')) for t in db.teachers.find() }

        raw = cls.get('assigned_subjects', [])
        assignments = []
        for a in (raw or []):
            if not a:
                continue
            if isinstance(a, str):
                sid = a; tid = None; time = None
            elif isinstance(a, dict):
                sid = a.get('subject_id') or a.get('subject')
                tid = a.get('teacher_id') or a.get('teacher')
                time = a.get('time')
            else:
                sid = str(a); tid = None; time = None

            subject_name = subject_map.get(str(sid)) if sid else None
            teacher_name = teacher_map.get(str(tid)) if tid else None

            assignments.append({
                'subject_id': sid,
                'subject_name': subject_name,
                'teacher_id': tid,
                'teacher_name': teacher_name,
                'time': time
            })

        cls['assigned_subjects'] = assignments
        return cls
    except:
        return None