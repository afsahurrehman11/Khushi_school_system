from app.database import get_db
from app.models.school import SchoolSchema, SchoolInDB, SchoolUpdate, SchoolResponse
from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

db = get_db()

def create_school(school: SchoolSchema) -> SchoolInDB:
    """Create a new school with normalized names"""
    # Check for duplicates (case-insensitive)
    existing = db.schools.find_one({"name": school.name.lower()})
    if existing:
        logger.warning(f"[SCHOOL] Duplicate school name attempted: {school.name}")
        raise ValueError(f"School with name '{school.name}' already exists")
    
    school_doc = {
        "name": school.name.lower(),
        "display_name": school.display_name or (school.name[0].upper() + school.name[1:] if school.name else school.name),
        "email": school.email,
        "phone": school.phone,
        "address": school.address,
        "city": school.city,
        "state": school.state,
        "country": school.country,
        "postal_code": school.postal_code,
        "website": school.website,
        "logo_url": school.logo_url,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = db.schools.insert_one(school_doc)
    school_doc["id"] = str(result.inserted_id)
    
    logger.info(f"[SCHOOL:{result.inserted_id}] Created school: {school.display_name}")
    return SchoolInDB(**school_doc)


def get_school(school_id: str) -> SchoolInDB:
    """Get school by ID"""
    school_doc = db.schools.find_one({"_id": ObjectId(school_id)})
    if not school_doc:
        logger.warning(f"[SCHOOL:{school_id}] School not found")
        return None
    
    school_doc["id"] = str(school_doc.pop("_id"))
    logger.info(f"[SCHOOL:{school_id}] Retrieved school")
    return SchoolInDB(**school_doc)


def get_all_schools(is_active: bool = None) -> list:
    """Get all schools with optional filters"""
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    
    schools = []
    for school_doc in db.schools.find(query):
        school_doc["id"] = str(school_doc.pop("_id"))
        schools.append(SchoolInDB(**school_doc))
    
    logger.info(f"[ROOT] Retrieved {len(schools)} schools")
    return schools


def get_school_by_name(name: str) -> SchoolInDB:
    """Get school by name (normalized)"""
    school_doc = db.schools.find_one({"name": name.lower()})
    if not school_doc:
        logger.warning(f"[SCHOOL] School '{name}' not found")
        return None
    
    school_doc["id"] = str(school_doc.pop("_id"))
    logger.info(f"[SCHOOL:{school_doc['id']}] Retrieved school by name")
    return SchoolInDB(**school_doc)


def update_school(school_id: str, school_update: SchoolUpdate) -> SchoolInDB:
    """Update school information"""
    update_data = school_update.dict(exclude_unset=True)
    
    # Normalize name if updating
    if "name" in update_data:
        # Check for duplicate
        existing = db.schools.find_one({
            "name": update_data["name"].lower(),
            "_id": {"$ne": ObjectId(school_id)}
        })
        if existing:
            logger.warning(f"[SCHOOL:{school_id}] Duplicate school name on update: {update_data['name']}")
            raise ValueError(f"School with name '{update_data['name']}' already exists")
        
        update_data["name"] = update_data["name"].lower()
    
    update_data["updated_at"] = datetime.utcnow()
    
    result = db.schools.update_one(
        {"_id": ObjectId(school_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        logger.warning(f"[SCHOOL:{school_id}] Update failed - school not found")
        raise ValueError(f"School {school_id} not found")
    
    school_doc = db.schools.find_one({"_id": ObjectId(school_id)})
    school_doc["id"] = str(school_doc.pop("_id"))
    
    logger.info(f"[SCHOOL:{school_id}] Updated school")
    return SchoolInDB(**school_doc)


def delete_school(school_id: str) -> bool:
    """Soft delete school (deactivate)"""
    result = db.schools.update_one(
        {"_id": ObjectId(school_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        logger.warning(f"[SCHOOL:{school_id}] Delete failed - school not found")
        return False
    
    logger.info(f"[SCHOOL:{school_id}] Deleted (deactivated) school")
    return True


def get_school_context(school_id: str) -> dict:
    """Get school context for logging purposes"""
    try:
        school = get_school(school_id)
        if school:
            return {"id": school_id, "name": school.display_name}
    except:
        pass
    return {"id": school_id, "name": "Unknown"}
