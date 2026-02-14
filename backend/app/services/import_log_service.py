"""
Import Log service — CRUD for import history records.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from bson.objectid import ObjectId
from app.database import get_db


def create_import_log(log_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new import log entry."""
    db = get_db()
    log_data["timestamp"] = datetime.utcnow()
    result = db.import_logs.insert_one(log_data)
    log_data["id"] = str(result.inserted_id)
    return log_data


def update_import_log(log_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing import log."""
    db = get_db()
    try:
        result = db.import_logs.find_one_and_update(
            {"_id": ObjectId(log_id)},
            {"$set": updates},
            return_document=True,
        )
        if result:
            result["id"] = str(result["_id"])
        return result
    except Exception:
        return None


def get_import_log(log_id: str) -> Optional[Dict[str, Any]]:
    """Get a single import log by ID."""
    db = get_db()
    try:
        log = db.import_logs.find_one({"_id": ObjectId(log_id)})
        if log:
            log["id"] = str(log["_id"])
        return log
    except Exception:
        return None


def get_all_import_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Get all import logs, most recent first."""
    db = get_db()
    logs = list(
        db.import_logs.find()
        .sort("timestamp", -1)
        .limit(limit)
    )
    for log in logs:
        log["id"] = str(log["_id"])
    return logs
