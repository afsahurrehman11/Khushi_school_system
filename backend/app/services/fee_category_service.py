from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Fee Category Operations =================

def create_fee_category(data: dict, school_id: str = None) -> Optional[dict]:
    """Create a new fee category"""
    if not school_id:
        logger.error("❌ Cannot create fee category without schoolId")
        return None
    
    db = get_db()
    
    category = {
        "school_id": school_id,
        "name": data.get("name"),
        "description": data.get("description"),
        "components": data.get("components", []),
        "is_archived": False,
        "created_by": data.get("created_by"),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.fee_categories.insert_one(category)
    category["id"] = str(result.inserted_id)
    logger.info(f"[SCHOOL:{school_id}] ✅ Created fee category {category['id']}")
    return category

def get_all_fee_categories(include_archived: bool = False, school_id: str = None) -> List[dict]:
    """Get all fee categories for a school"""
    if not school_id:
        logger.error("❌ Cannot fetch fee categories without schoolId")
        return []
    
    db = get_db()
    query = {"school_id": school_id}
    if not include_archived:
        query["is_archived"] = False
    
    categories = list(db.fee_categories.find(query).sort("created_at", -1))
    
    for cat in categories:
        cat["id"] = str(cat["_id"])
    
    logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(categories)} fee categories")
    return categories

def get_fee_category_by_id(category_id: str, school_id: str = None) -> Optional[dict]:
    """Get fee category by ID (school-scoped)"""
    if not school_id:
        logger.error("❌ Cannot fetch fee category without schoolId")
        return None
    
    db = get_db()
    try:
        category = db.fee_categories.find_one({"_id": ObjectId(category_id), "school_id": school_id})
        if category:
            category["id"] = str(category["_id"])
            logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved fee category {category_id}")
        else:
            logger.warning(f"[SCHOOL:{school_id}] Fee category {category_id} not found")
        return category
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching fee category: {str(e)}")
        return None

def update_fee_category(category_id: str, data: dict, school_id: str = None) -> Optional[dict]:
    """Update fee category (school-scoped)"""
    if not school_id:
        logger.error("❌ Cannot update fee category without schoolId")
        return None
    
    db = get_db()
    try:
        oid = ObjectId(category_id)
    except:
        logger.error(f"[SCHOOL:{school_id}] ❌ Invalid category ID: {category_id}")
        return None
    
    update = {}
    if "name" in data:
        update["name"] = data["name"]
    if "description" in data:
        update["description"] = data["description"]
    if "components" in data:
        update["components"] = data["components"]
    if "is_archived" in data:
        update["is_archived"] = data["is_archived"]
    
    update["updated_at"] = datetime.utcnow()
    
    result = db.fee_categories.find_one_and_update(
        {"_id": oid, "school_id": school_id},
        {"$set": update},
        return_document=True
    )
    
    if result:
        result["id"] = str(result["_id"])
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated fee category {category_id}")
    else:
        logger.warning(f"[SCHOOL:{school_id}] Fee category {category_id} not found")
    return result

def delete_fee_category(category_id: str, school_id: str = None) -> bool:
    """Delete fee category (soft delete via archiving)"""
    if not school_id:
        logger.error("❌ Cannot delete fee category without schoolId")
        return False
    
    db = get_db()
    try:
        result = db.fee_categories.find_one_and_update(
            {"_id": ObjectId(category_id), "school_id": school_id},
            {"$set": {"is_archived": True, "updated_at": datetime.utcnow()}},
            return_document=True
        )
        if result:
            logger.info(f"[SCHOOL:{school_id}] ✅ Archived fee category {category_id}")
        else:
            logger.warning(f"[SCHOOL:{school_id}] Fee category {category_id} not found")
        return result is not None
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error deleting fee category: {str(e)}")
        return False

def archive_fee_category(category_id: str, school_id: str = None) -> bool:
    """Archive a fee category"""
    return delete_fee_category(category_id, school_id=school_id)

def duplicate_fee_category(category_id: str, new_name: str, created_by: str, school_id: str = None) -> Optional[dict]:
    """Duplicate a fee category (school-scoped)"""
    if not school_id:
        logger.error("❌ Cannot duplicate fee category without schoolId")
        return None
    
    db = get_db()
    
    original = get_fee_category_by_id(category_id, school_id=school_id)
    if not original:
        logger.warning(f"[SCHOOL:{school_id}] Cannot duplicate - category {category_id} not found")
        return None
    
    new_category = {
        "school_id": school_id,
        "name": new_name,
        "description": original.get("description"),
        "components": original.get("components", []),
        "is_archived": False,
        "created_by": created_by,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.fee_categories.insert_one(new_category)
    new_category["id"] = str(result.inserted_id)
    logger.info(f"[SCHOOL:{school_id}] ✅ Duplicated fee category to {new_category['id']}")
    return new_category

# ================= Category Snapshot Operations =================

def create_category_snapshot(category_id: str, school_id: str = None) -> Optional[dict]:
    """Create a snapshot of fee category (for historical protection)"""
    if not school_id:
        logger.error("❌ Cannot create snapshot without schoolId")
        return None
    
    db = get_db()
    
    category = get_fee_category_by_id(category_id, school_id=school_id)
    if not category:
        logger.warning(f"[SCHOOL:{school_id}] Cannot snapshot - category {category_id} not found")
        return None
    
    total_amount = sum(comp.get("amount", 0) for comp in category.get("components", []))
    
    snapshot = {
        "school_id": school_id,
        "category_id": category_id,
        "category_name": category.get("name"),
        "components": category.get("components", []),
        "total_amount": total_amount,
        "snapshot_date": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    
    result = db.category_snapshots.insert_one(snapshot)
    snapshot["id"] = str(result.inserted_id)
    logger.info(f"[SCHOOL:{school_id}] ✅ Created category snapshot {snapshot['id']}")
    return snapshot

def get_category_snapshot(snapshot_id: str, school_id: str = None) -> Optional[dict]:
    """Get category snapshot by ID (school-scoped)"""
    if not school_id:
        logger.error("❌ Cannot fetch snapshot without schoolId")
        return None
    
    db = get_db()
    try:
        snapshot = db.category_snapshots.find_one({"_id": ObjectId(snapshot_id), "school_id": school_id})
        if snapshot:
            snapshot["id"] = str(snapshot["_id"])
            logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved snapshot {snapshot_id}")
        else:
            logger.warning(f"[SCHOOL:{school_id}] Snapshot {snapshot_id} not found")
        return snapshot
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching snapshot: {str(e)}")
        return None

def calculate_category_total(components: List[dict]) -> float:
    """Calculate total amount from components"""
    return sum(comp.get("amount", 0) for comp in components)
