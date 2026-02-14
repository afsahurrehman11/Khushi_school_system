from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId

# ================= Fee Category Operations =================

def create_fee_category(data: dict) -> Optional[dict]:
    """Create a new fee category"""
    db = get_db()
    
    category = {
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
    return category

def get_all_fee_categories(include_archived: bool = False) -> List[dict]:
    """Get all fee categories"""
    db = get_db()
    query = {} if include_archived else {"is_archived": False}
    categories = list(db.fee_categories.find(query).sort("created_at", -1))
    
    for cat in categories:
        cat["id"] = str(cat["_id"])
    return categories

def get_fee_category_by_id(category_id: str) -> Optional[dict]:
    """Get fee category by ID"""
    db = get_db()
    try:
        category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
        if category:
            category["id"] = str(category["_id"])
        return category
    except:
        return None

def update_fee_category(category_id: str, data: dict) -> Optional[dict]:
    """Update fee category"""
    db = get_db()
    try:
        oid = ObjectId(category_id)
    except:
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
        {"_id": oid},
        {"$set": update},
        return_document=True
    )
    
    if result:
        result["id"] = str(result["_id"])
    return result

def delete_fee_category(category_id: str) -> bool:
    """Delete fee category (soft delete via archiving)"""
    db = get_db()
    try:
        result = db.fee_categories.find_one_and_update(
            {"_id": ObjectId(category_id)},
            {"$set": {"is_archived": True, "updated_at": datetime.utcnow()}},
            return_document=True
        )
        return result is not None
    except:
        return False

def archive_fee_category(category_id: str) -> bool:
    """Archive a fee category"""
    return delete_fee_category(category_id)

def duplicate_fee_category(category_id: str, new_name: str, created_by: str) -> Optional[dict]:
    """Duplicate a fee category"""
    db = get_db()
    
    original = get_fee_category_by_id(category_id)
    if not original:
        return None
    
    new_category = {
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
    return new_category

# ================= Category Snapshot Operations =================

def create_category_snapshot(category_id: str) -> Optional[dict]:
    """Create a snapshot of fee category (for historical protection)"""
    db = get_db()
    
    category = get_fee_category_by_id(category_id)
    if not category:
        return None
    
    total_amount = sum(comp.get("amount", 0) for comp in category.get("components", []))
    
    snapshot = {
        "category_id": category_id,
        "category_name": category.get("name"),
        "components": category.get("components", []),
        "total_amount": total_amount,
        "snapshot_date": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    
    result = db.category_snapshots.insert_one(snapshot)
    snapshot["id"] = str(result.inserted_id)
    return snapshot

def get_category_snapshot(snapshot_id: str) -> Optional[dict]:
    """Get category snapshot by ID"""
    db = get_db()
    try:
        snapshot = db.category_snapshots.find_one({"_id": ObjectId(snapshot_id)})
        if snapshot:
            snapshot["id"] = str(snapshot["_id"])
        return snapshot
    except:
        return None

def calculate_category_total(components: List[dict]) -> float:
    """Calculate total amount from components"""
    return sum(comp.get("amount", 0) for comp in components)
