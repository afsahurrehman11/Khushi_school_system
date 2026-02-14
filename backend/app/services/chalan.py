from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId

# ================= Category Snapshot Operations =================

def create_category_snapshot(category_id: str) -> Optional[dict]:
    """Create a snapshot of fee category (for historical protection)"""
    db = get_db()
    
    try:
        category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
    except:
        return None
    
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

# ================= Enhanced Challan Operations =================

def create_chalan_from_category(data: dict) -> Optional[dict]:
    """Create challan from fee category (category-driven)"""
    db = get_db()
    
    student_id = data.get("student_id")
    class_id = data.get("class_id")
    category_id = data.get("category_id")
    due_date = data.get("due_date")
    issue_date = data.get("issue_date") or datetime.utcnow().isoformat()
    
    # Get category and create snapshot
    try:
        category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
    except:
        return None
    
    if not category:
        return None
    
    snapshot = create_category_snapshot(category_id)
    if not snapshot:
        return None
    
    # Get student info
    try:
        student = db.students.find_one({"_id": ObjectId(student_id)})
    except:
        student = db.students.find_one({"student_id": student_id})
    
    if not student:
        return None
    
    # Get class info
    try:
        cls = db.classes.find_one({"_id": ObjectId(class_id)})
    except:
        cls = db.classes.find_one({"class_id": class_id})
    
    if not cls:
        cls = {}
    
    # Create chalan with category snapshot
    chalan = {
        "student_id": student_id,
        "class_id": class_id,
        "category_snapshot_id": snapshot["id"],
        "student_name": student.get("full_name") or student.get("student_name"),
        "student_roll": student.get("roll_number"),
        "father_name": student.get("guardian_info", {}).get("father_name") if isinstance(student.get("guardian_info"), dict) else None,
        "class_section": cls.get("class_name", "") + (" - " + cls.get("section", "") if cls.get("section") else ""),
        "issue_date": datetime.fromisoformat(issue_date) if isinstance(issue_date, str) else issue_date,
        "due_date": datetime.fromisoformat(due_date) if isinstance(due_date, str) else due_date,
        "line_items": [{"label": comp["component_name"], "amount": comp["amount"]} for comp in snapshot.get("components", [])],
        "total_amount": snapshot.get("total_amount", 0),
        "paid_amount": 0,
        "remaining_amount": snapshot.get("total_amount", 0),
        "status": "unpaid",
        "last_payment_date": None,
        "notes": data.get("notes"),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.student_challans.insert_one(chalan)
    chalan["id"] = str(result.inserted_id)
    return chalan

def create_bulk_challans_from_category(class_id: str, student_ids: List[str], category_id: str, due_date: str, issue_date: Optional[str] = None) -> List[dict]:
    """Create challans for multiple students"""
    challans = []
    for student_id in student_ids:
        chalan = create_chalan_from_category({
            "student_id": student_id,
            "class_id": class_id,
            "category_id": category_id,
            "due_date": due_date,
            "issue_date": issue_date,
        })
        if chalan:
            challans.append(chalan)
    return challans

# ================= Challan Query Operations =================

def create_chalan(data: dict) -> Optional[dict]:
    """Create a new chalan (legacy method)"""
    db = get_db()
    
    # Calculate grand total from line items
    line_items = data.get('line_items', [])
    grand_total = sum(item.get('amount', 0) for item in line_items)
    
    chalan = {
        "student_id": data.get('student_id'),
        "admission_no": data.get('admission_no'),
        "student_name": data.get('student_name'),
        "father_name": data.get('father_name'),
        "class_section": data.get('class_section'),
        "issue_date": data.get('issue_date'),
        "due_date": data.get('due_date'),
        "line_items": line_items,
        "grand_total": grand_total,
        "status": data.get('status', 'pending'),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.chalans.insert_one(chalan)
    chalan["_id"] = str(result.inserted_id)
    chalan["id"] = str(result.inserted_id)
    return chalan

def get_all_challans() -> List[dict]:
    """Get all chalans"""
    db = get_db()
    challans = list(db.student_challans.find().sort("created_at", -1))
    
    for chalan in challans:
        chalan["id"] = str(chalan["_id"])
    
    return challans

def get_chalan_by_id(chalan_id: str) -> Optional[dict]:
    """Get chalan by ID"""
    db = get_db()
    try:
        chalan = db.student_challans.find_one({"_id": ObjectId(chalan_id)})
        if not chalan:
            return None
        
        chalan["id"] = str(chalan["_id"])
        return chalan
    except:
        return None

def update_chalan(chalan_id: str, data: dict) -> Optional[dict]:
    """Update an existing chalan"""
    db = get_db()
    try:
        oid = ObjectId(chalan_id)
    except:
        return None
    
    update = {}
    
    if 'due_date' in data:
        update['due_date'] = data['due_date']
    if 'status' in data:
        update['status'] = data['status']
    if 'notes' in data:
        update['notes'] = data['notes']
    
    if not update:
        return get_chalan_by_id(chalan_id)
    
    update['updated_at'] = datetime.utcnow()
    
    result = db.student_challans.update_one({'_id': oid}, {'$set': update})
    if result.matched_count == 0:
        return None
    
    return get_chalan_by_id(chalan_id)

def delete_chalan(chalan_id: str) -> bool:
    """Delete a chalan"""
    db = get_db()
    try:
        oid = ObjectId(chalan_id)
    except:
        return False
    
    result = db.student_challans.delete_one({'_id': oid})
    return result.deleted_count > 0

def get_chalans_by_student(student_id: str) -> List[dict]:
    """Get all chalans for a specific student"""
    db = get_db()
    challans = list(db.student_challans.find({"student_id": student_id}).sort("created_at", -1))
    
    for chalan in challans:
        chalan["id"] = str(chalan["_id"])
    
    return challans

def get_chalans_by_class(class_id: str) -> List[dict]:
    """Get all challans for a class"""
    db = get_db()
    challans = list(db.student_challans.find({"class_id": class_id}).sort("created_at", -1))
    
    for chalan in challans:
        chalan["id"] = str(chalan["_id"])
    
    return challans

def get_challans_by_status(status: str) -> List[dict]:
    """Get all challans with specific status"""
    db = get_db()
    challans = list(db.student_challans.find({"status": status}).sort("created_at", -1))
    
    for chalan in challans:
        chalan["id"] = str(chalan["_id"])
    
    return challans

def search_challans(filters: dict) -> List[dict]:
    """Search challans with complex filters"""
    db = get_db()
    challans = list(db.student_challans.find(filters).sort("created_at", -1))
    
    for chalan in challans:
        chalan["id"] = str(chalan["_id"])
    
    return challans
