from app.database import get_db
from datetime import datetime
from typing import Optional
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)


# ================= Grade Operations =================

def create_grade(grade_data: dict, school_id: str = None) -> Optional[dict]:
    db = get_db()

    if not school_id:
        logger.error(f"❌ Cannot create grade without schoolId")
        return None

    grade_data["school_id"] = school_id

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
    logger.info(f"[SCHOOL:{school_id}] ✅ Grade created for student {grade_data.get('student_id')}")
    return grade_data


def get_all_grades(filters: dict = None, school_id: str = None) -> list:
    db = get_db()
    query = filters or {}
    if school_id:
        query["school_id"] = school_id
        logger.info(f"[SCHOOL:{school_id}] Fetching grades")
    grades = list(db.grades.find(query))
    for g in grades:
        g["id"] = str(g["_id"])
    if school_id:
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(grades)} grades")
    return grades


def get_grade_by_id(grade_id: str, school_id: str = None) -> Optional[dict]:
    db = get_db()
    try:
        query = {"_id": ObjectId(grade_id)}
        if school_id:
            query["school_id"] = school_id
        grade = db.grades.find_one(query)
        if grade:
            grade["id"] = str(grade["_id"])
        return grade
    except:
        return None


def get_grades_by_student(student_id: str, school_id: str = None) -> list:
    db = get_db()
    query = {"student_id": student_id}
    if school_id:
        query["school_id"] = school_id
    grades = list(db.grades.find(query))
    for g in grades:
        g["id"] = str(g["_id"])
    return grades


def update_grade(grade_id: str, school_id: str = None, **kwargs) -> Optional[dict]:
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
        query = {"_id": ObjectId(grade_id)}
        if school_id:
            query["school_id"] = school_id
        result = db.grades.find_one_and_update(
            query,
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
            if school_id:
                logger.info(f"[SCHOOL:{school_id}] ✅ Grade {grade_id} updated")
        elif school_id:
            logger.warning(f"[SCHOOL:{school_id}] Grade {grade_id} not found")
        return result
    except Exception as e:
        if school_id:
            logger.error(f"[SCHOOL:{school_id}] Failed to update grade: {str(e)}")
        return None


def delete_grade(grade_id: str, school_id: str = None) -> bool:
    db = get_db()
    try:
        query = {"_id": ObjectId(grade_id)}
        if school_id:
            query["school_id"] = school_id
        result = db.grades.delete_one(query)
        if school_id and result.deleted_count > 0:
            logger.info(f"[SCHOOL:{school_id}] ✅ Grade {grade_id} deleted")
        return result.deleted_count > 0
    except:
        return False
