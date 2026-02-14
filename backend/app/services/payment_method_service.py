from app.database import get_db
from datetime import datetime
from typing import Optional, List
from bson.objectid import ObjectId


def create_or_get_payment_method(name: str) -> dict:
    """Create a payment method name if it doesn't exist (case-insensitive), return the saved record."""
    db = get_db()
    if not name:
        return {}
    normalized = name.strip()
    if not normalized:
        return {}
    # case-insensitive search
    existing = db.payment_methods.find_one({"normalized": normalized.lower()})
    if existing:
        existing["id"] = str(existing["_id"])  # make jsonable
        return existing

    doc = {
        "name": normalized,
        "normalized": normalized.lower(),
        "created_at": datetime.utcnow(),
    }
    result = db.payment_methods.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc


def list_payment_methods() -> List[dict]:
    db = get_db()
    methods = list(db.payment_methods.find({}).sort("name", 1))
    for m in methods:
        m["id"] = str(m["_id"])
    return methods
