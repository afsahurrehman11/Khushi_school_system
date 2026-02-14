from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId


# ================= Grade Operations =================

def create_grade(grade_data: dict) -> Optional[dict]:
    db = get_db()

    # compute percentage if total and obtained provided
    total = grade_data.get("total_marks")
    obtained = grade_data.get("obtained_marks")
    if total is not None and total > 0 and obtained is not None:
        try:
            pct = round((float(obtained) / float(total)) * 100, 2)
        except Exception:
            pct = None
        grade_data["percentage"] = pct
    else:
        grade_data["percentage"] = None

    grade_data["created_at"] = datetime.utcnow()
    grade_data["updated_at"] = datetime.utcnow()

    result = db.grades.insert_one(grade_data)
    grade_data["_id"] = str(result.inserted_id)
    return grade_data


def get_all_grades(filters: dict = None) -> list:
    db = get_db()
    query = filters or {}
    grades = list(db.grades.find(query))
    for g in grades:
        g["id"] = str(g["_id"])
    return grades


def get_grade_by_id(grade_id: str) -> Optional[dict]:
    db = get_db()
    try:
        grade = db.grades.find_one({"_id": ObjectId(grade_id)})
        if grade:
            grade["id"] = str(grade["_id"])
        return grade
    except:
        return None


def get_grades_by_student(student_id: str) -> list:
    db = get_db()
    grades = list(db.grades.find({"student_id": student_id}))
    for g in grades:
        g["id"] = str(g["_id"])
    return grades


def update_grade(grade_id: str, **kwargs) -> Optional[dict]:
    db = get_db()
    try:
        # if marks changed, recompute percentage
        total = kwargs.get("total_marks")
        obtained = kwargs.get("obtained_marks")
        if total is not None and obtained is not None and total > 0:
            try:
                kwargs["percentage"] = round((float(obtained) / float(total)) * 100, 2)
            except Exception:
                kwargs["percentage"] = None

        kwargs["updated_at"] = datetime.utcnow()
        result = db.grades.find_one_and_update(
            {"_id": ObjectId(grade_id)},
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except:
        return None


def delete_grade(grade_id: str) -> bool:
    db = get_db()
    try:
        result = db.grades.delete_one({"_id": ObjectId(grade_id)})
        return result.deleted_count > 0
    except:
        return False
