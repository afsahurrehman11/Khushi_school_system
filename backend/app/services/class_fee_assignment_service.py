from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId
from bson import ObjectId as BsonObjectId
from app.services import chalan as chalan_service


def _normalize_doc(doc: dict) -> dict:
    """Convert ObjectId values to strings and remove MongoDB-specific keys."""
    if not isinstance(doc, dict):
        return doc

    normalized = {}
    for k, v in doc.items():
        if isinstance(v, BsonObjectId):
            normalized[k] = str(v)
        else:
            normalized[k] = v

    if "_id" in normalized:
        try:
            normalized["id"] = str(normalized["_id"])
        except Exception:
            normalized["id"] = normalized["_id"]
        del normalized["_id"]

    return normalized

# ================= Class Fee Assignment Operations =================

def assign_fee_category_to_class(class_id: str, category_id: str, assigned_by: str, apply_to_existing: bool = False) -> Optional[dict]:
    """Assign a fee category to a class"""
    db = get_db()
    
    # Remove any existing active assignment for this class
    db.class_fee_assignments.update_many(
        {"class_id": class_id, "is_active": True},
        {"$set": {"is_active": False, "deactivated_at": datetime.utcnow()}}
    )
    
    assignment = {
        "class_id": class_id,
        "category_id": category_id,
        "assigned_by": assigned_by,
        "assigned_at": datetime.utcnow(),
        "is_active": True,
        "deactivated_at": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.class_fee_assignments.insert_one(assignment)
    assignment["id"] = str(result.inserted_id)

    # If requested, apply this category to existing pending/unpaid challans for the class
    if apply_to_existing:
        try:
            snapshot = chalan_service.create_category_snapshot(category_id)
            if snapshot:
                # find matching challans
                existing = list(db.student_challans.find({"class_id": class_id, "status": {"$in": ["pending", "unpaid"]}}))
                for ch in existing:
                    paid = ch.get("paid_amount", ch.get("paid", 0)) or 0
                    new_total = snapshot.get("total_amount", 0)
                    new_remaining = max(0, new_total - paid)
                    update = {
                        "category_snapshot_id": snapshot.get("id"),
                        "line_items": [{"label": c["component_name"], "amount": c["amount"]} for c in snapshot.get("components", [])],
                        "total_amount": new_total,
                        "remaining_amount": new_remaining,
                        "updated_at": datetime.utcnow(),
                    }
                    try:
                        oid = ObjectId(ch["_id"]) if isinstance(ch.get("_id"), str) is False else ObjectId(ch["_id"])
                    except Exception:
                        oid = None
                    if oid:
                        db.student_challans.update_one({"_id": oid}, {"$set": update})
        except Exception as e:
            # log and continue; assignment succeeded but applying to existing may have partial failures
            print("Error applying category to existing challans:", e)

    return _normalize_doc(assignment)

def get_active_category_for_class(class_id: str) -> Optional[dict]:
    """Get currently active fee category for a class"""
    db = get_db()
    
    assignment = db.class_fee_assignments.find_one({
        "class_id": class_id,
        "is_active": True
    })
    
    if assignment:
        return _normalize_doc(assignment)
    return None

def get_class_fee_assignment_history(class_id: str) -> List[dict]:
    """Get all fee category assignments for a class (history)"""
    db = get_db()
    
    assignments = list(db.class_fee_assignments.find({"class_id": class_id}).sort("assigned_at", -1))
    return [_normalize_doc(a) for a in assignments]

def get_all_fee_assignments() -> List[dict]:
    """Get all active class fee assignments"""
    db = get_db()
    
    assignments = list(db.class_fee_assignments.find({"is_active": True}).sort("assigned_at", -1))
    return [_normalize_doc(a) for a in assignments]

def get_classes_using_category(category_id: str) -> List[dict]:
    """Get all classes currently using a fee category"""
    db = get_db()
    
    assignments = list(db.class_fee_assignments.find({
        "category_id": category_id,
        "is_active": True
    }))
    
    for assign in assignments:
        assign["id"] = str(assign["_id"])
    return assignments

def update_class_fee_assignment(assignment_id: str, category_id: str, assigned_by: str) -> Optional[dict]:
    """Update fee category assignment for a class (creates new assignment, deactivates old)"""
    db = get_db()
    try:
        oid = ObjectId(assignment_id)
    except:
        return None
    
    assignment = db.class_fee_assignments.find_one({"_id": oid})
    if not assignment:
        return None
    
    class_id = assignment.get("class_id")
    
    # Deactivate old assignment
    db.class_fee_assignments.update_one(
        {"_id": oid},
        {"$set": {"is_active": False, "deactivated_at": datetime.utcnow()}}
    )
    
    # Create new assignment
    return assign_fee_category_to_class(class_id, category_id, assigned_by)

def remove_fee_category_from_class(class_id: str) -> bool:
    """Remove active fee category assignment from a class"""
    db = get_db()
    
    result = db.class_fee_assignments.update_many(
        {"class_id": class_id, "is_active": True},
        {"$set": {"is_active": False, "deactivated_at": datetime.utcnow()}}
    )
    
    return result.modified_count > 0
