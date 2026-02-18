from app.database import get_db
from datetime import datetime
from typing import Optional, Dict
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Teacher Operations =================

def create_teacher(teacher_data: dict) -> Optional[dict]:
    db = get_db()
    school_id = teacher_data.get("school_id")
    
    if not school_id:
        logger.error(f"❌ Cannot create teacher without schoolId")
        return None
    
    logger.info(f"[SCHOOL:{school_id}] Creating teacher: {teacher_data.get('name', 'Unknown')}")

    # simple uniqueness by email if provided (within school)
    if teacher_data.get("email") and db.teachers.find_one({"email": teacher_data.get("email"), "school_id": school_id}):
        logger.warning(f"[SCHOOL:{school_id}] Teacher email already exists: {teacher_data.get('email')}")
        return None
    # uniqueness by CNIC if provided (within school)
    if teacher_data.get("cnic") and db.teachers.find_one({"cnic": teacher_data.get("cnic"), "school_id": school_id}):
        logger.warning(f"[SCHOOL:{school_id}] Teacher CNIC already exists: {teacher_data.get('cnic')}")
        return None

    # Normalize assigned_classes: accept class IDs or class names (within school)
    assigned = teacher_data.get("assigned_classes") or []
    resolved_class_ids = []
    for item in assigned:
        try:
            # treat as ObjectId string
            if isinstance(item, str) and len(item) == 24:
                # ensure exists and belongs to same school
                found = db.classes.find_one({"_id": ObjectId(item), "school_id": school_id})
                if found:
                    resolved_class_ids.append(str(found["_id"]))
                    continue
        except Exception:
            pass

        # otherwise try find by class_name or "Class - Section" (within school)
        if isinstance(item, str):
            parts = [p.strip() for p in item.split('-')]
            if len(parts) == 2:
                cls = db.classes.find_one({"class_name": parts[0], "section": parts[1], "school_id": school_id})
            else:
                cls = db.classes.find_one({"class_name": item, "school_id": school_id})
            if cls:
                resolved_class_ids.append(str(cls["_id"]))

    teacher_data["assigned_classes"] = resolved_class_ids

    # Normalize assigned_subjects: accept subject ids or codes (within school)
    assigned_subs = teacher_data.get("assigned_subjects") or []
    resolved_sub_ids = []
    for s in assigned_subs:
        if isinstance(s, str) and len(s) == 24:
            try:
                found = db.subjects.find_one({"_id": ObjectId(s), "school_id": school_id})
                if found:
                    resolved_sub_ids.append(str(found["_id"]))
                    continue
            except Exception:
                pass
        # try by subject_code (within school)
        sub = db.subjects.find_one({"subject_code": s, "school_id": school_id}) if isinstance(s, str) else None
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
    teacher_data["id"] = str(result.inserted_id)

    # Attach teacher email to classes assigned_teachers (within school)
    if teacher_data.get("email") and resolved_class_ids:
        for cid in resolved_class_ids:
            try:
                db.classes.update_one({"_id": ObjectId(cid), "school_id": school_id}, {"$addToSet": {"assigned_teachers": teacher_data["email"]}})
            except Exception:
                pass

    logger.info(f"[SCHOOL:{school_id}] ✅ Teacher created: {teacher_data.get('name')}")
    return teacher_data


def get_all_teachers(filters: dict = None, school_id: str = None) -> list:
    db = get_db()
    query = filters or {}
    
    # Add school isolation
    if school_id:
        query["school_id"] = school_id
        logger.info(f"[SCHOOL:{school_id}] Fetching teachers")
    
    teachers = list(db.teachers.find(query))
    for t in teachers:
        t["id"] = str(t["_id"])
    
    if school_id:
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(teachers)} teachers")
    return teachers


def get_teacher_by_id(teacher_id: str, school_id: str = None) -> Optional[dict]:
    db = get_db()
    try:
        query = {"_id": ObjectId(teacher_id)}
        if school_id:
            query["school_id"] = school_id
        
        teacher = db.teachers.find_one(query)
        if teacher:
            teacher["id"] = str(teacher["_id"])
        return teacher
    except:
        # try fallback by CNIC or other unique string field
        try:
            query = {"cnic": teacher_id}
            if school_id:
                query["school_id"] = school_id
            
            teacher = db.teachers.find_one(query)
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


def update_teacher(teacher_id: str, school_id: str = None, **kwargs) -> Optional[dict]:
    db = get_db()
    try:
        query = {"_id": ObjectId(teacher_id)}
        if school_id:
            query["school_id"] = school_id
        
        kwargs["updated_at"] = datetime.utcnow()
        result = db.teachers.find_one_and_update(
            query,
            {"$set": kwargs},
            return_document=True
        )
        if result:
            result["id"] = str(result["_id"])
            logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Teacher updated: {teacher_id}")
        return result
    except:
        # fallback: try updating by CNIC
        try:
            query = {"cnic": teacher_id}
            if school_id:
                query["school_id"] = school_id
            
            kwargs["updated_at"] = datetime.utcnow()
            result = db.teachers.find_one_and_update(
                query,
                {"$set": kwargs},
                return_document=True
            )
            if result:
                result["id"] = str(result["_id"])
                logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Teacher updated: {teacher_id}")
            return result
        except:
            return None


def delete_teacher(teacher_id: str, school_id: str = None) -> bool:
    db = get_db()
    try:
        query = {"_id": ObjectId(teacher_id)}
        if school_id:
            query["school_id"] = school_id
        
        result = db.teachers.delete_one(query)
        if result.deleted_count > 0:
            logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Teacher deleted: {teacher_id}")
            return True
        # fallback: try delete by CNIC
        query = {"cnic": teacher_id}
        if school_id:
            query["school_id"] = school_id
        
        result2 = db.teachers.delete_one(query)
        if result2.deleted_count > 0:
            logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Teacher deleted: {teacher_id}")
        return result2.deleted_count > 0
    except:
        return False
