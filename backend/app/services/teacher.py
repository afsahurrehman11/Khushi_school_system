from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId


# ================= Teacher Operations =================

def create_teacher(teacher_data: dict) -> Optional[dict]:
    db = get_db()

    # simple uniqueness by email if provided
    if teacher_data.get("email") and db.teachers.find_one({"email": teacher_data.get("email")}):
        return None
    # uniqueness by CNIC if provided
    if teacher_data.get("cnic") and db.teachers.find_one({"cnic": teacher_data.get("cnic")}):
        return None

    # Normalize assigned_classes: accept class IDs or class names
    assigned = teacher_data.get("assigned_classes") or []
    resolved_class_ids = []
    for item in assigned:
        try:
            # treat as ObjectId string
            if isinstance(item, str) and len(item) == 24:
                # ensure exists
                found = db.classes.find_one({"_id": ObjectId(item)})
                if found:
                    resolved_class_ids.append(str(found["_id"]))
                    continue
        except Exception:
            pass

        # otherwise try find by class_name or "Class - Section"
        if isinstance(item, str):
            parts = [p.strip() for p in item.split('-')]
            if len(parts) == 2:
                cls = db.classes.find_one({"class_name": parts[0], "section": parts[1]})
            else:
                cls = db.classes.find_one({"class_name": item})
            if cls:
                resolved_class_ids.append(str(cls["_id"]))

    teacher_data["assigned_classes"] = resolved_class_ids

    # Normalize assigned_subjects: accept subject ids or codes
    assigned_subs = teacher_data.get("assigned_subjects") or []
    resolved_sub_ids = []
    for s in assigned_subs:
        if isinstance(s, str) and len(s) == 24:
            try:
                found = db.subjects.find_one({"_id": ObjectId(s)})
                if found:
                    resolved_sub_ids.append(str(found["_id"]))
                    continue
            except Exception:
                pass
        # try by subject_code
        sub = db.subjects.find_one({"subject_code": s}) if isinstance(s, str) else None
        if sub:
            resolved_sub_ids.append(str(sub["_id"]))

    teacher_data["assigned_subjects"] = resolved_sub_ids

    # Derive branch_code from first assigned class if available
    branch = None
    if resolved_class_ids:
        cls = db.classes.find_one({"_id": ObjectId(resolved_class_ids[0])})
        if cls and cls.get("branch_code"):
            branch = cls.get("branch_code")
    teacher_data["branch_code"] = branch or teacher_data.get("branch_code") or "MAIN"

    teacher_data["created_at"] = datetime.utcnow()
    teacher_data["updated_at"] = datetime.utcnow()

    result = db.teachers.insert_one(teacher_data)
    teacher_data["_id"] = str(result.inserted_id)

    # Attach teacher email to classes assigned_teachers
    if teacher_data.get("email") and resolved_class_ids:
        for cid in resolved_class_ids:
            try:
                db.classes.update_one({"_id": ObjectId(cid)}, {"$addToSet": {"assigned_teachers": teacher_data["email"]}})
            except Exception:
                pass

    return teacher_data


def get_all_teachers(filters: dict = None) -> list:
    db = get_db()
    query = filters or {}
    teachers = list(db.teachers.find(query))
    for t in teachers:
        t["id"] = str(t["_id"])
    return teachers


def get_teacher_by_id(teacher_id: str) -> Optional[dict]:
    db = get_db()
    try:
        teacher = db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if teacher:
            teacher["id"] = str(teacher["_id"])
        return teacher
    except:
        # try fallback by CNIC or other unique string field
        try:
            teacher = db.teachers.find_one({"cnic": teacher_id})
            if teacher:
                teacher["id"] = str(teacher["_id"])
            return teacher
        except:
            return None


def get_teacher_by_teacher_id(teacher_id: str) -> Optional[dict]:
    db = get_db()
    teacher = db.teachers.find_one({"teacher_id": teacher_id})
    if teacher:
        teacher["id"] = str(teacher["_id"])
    return teacher


def update_teacher(teacher_id: str, **kwargs) -> Optional[dict]:
    db = get_db()
    try:
        kwargs["updated_at"] = datetime.utcnow()
        result = db.teachers.find_one_and_update(
            {"_id": ObjectId(teacher_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        # fallback: try updating by CNIC
        try:
            kwargs["updated_at"] = datetime.utcnow()
            result = db.teachers.find_one_and_update(
                {"cnic": teacher_id},
                {"$set": kwargs},
                return_document=True
            )
            if result:
                result["id"] = str(result["_id"])
            return result
        except:
            return None


def delete_teacher(teacher_id: str) -> bool:
    db = get_db()
    try:
        result = db.teachers.delete_one({"_id": ObjectId(teacher_id)})
        if result.deleted_count > 0:
            return True
        # fallback: try delete by CNIC
        result2 = db.teachers.delete_one({"cnic": teacher_id})
        return result2.deleted_count > 0
    except:
        return False
