from app.database import get_db
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Accountant Operations =================

def create_accountant_profile(user_id: str, school_id: str = None) -> Optional[dict]:
    """Create accountant profile for a user"""
    if not school_id:
        logger.error("❌ Cannot create accountant profile without schoolId")
        return None
    
    db = get_db()
    
    profile = {
        "user_id": user_id,
        "school_id": school_id,
        "opening_balance": 0.0,
        "current_balance": 0.0,
        "total_collected": 0.0,
        "last_updated": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    
    result = db.accountant_profiles.insert_one(profile)
    profile["id"] = str(result.inserted_id)
    logger.info(f"[SCHOOL:{school_id}] ✅ Created accountant profile")
    
    return profile

def get_accountant_profile(user_id: str, school_id: str = None) -> Optional[dict]:
    """Get accountant profile by user ID"""
    if not school_id:
        logger.error("❌ Cannot get accountant profile without schoolId")
        return None
    
    db = get_db()
    
    profile = db.accountant_profiles.find_one({"user_id": user_id, "school_id": school_id})
    if profile:
        profile["id"] = str(profile["_id"])
    return profile

def update_accountant_balance(user_id: str, amount: float, type_: str, description: str, recorded_by: str, school_id: str = None) -> bool:
    """Update accountant balance"""
    if not school_id:
        logger.error("❌ Cannot update balance without schoolId")
        return False
    
    db = get_db()
    
    # Get current profile
    profile = db.accountant_profiles.find_one({"user_id": user_id, "school_id": school_id})
    if not profile:
        logger.error(f"[SCHOOL:{school_id}] ❌ Profile not found")
        return False
    
    current_balance = profile.get("current_balance", 0.0)
    total_collected = profile.get("total_collected", 0.0)
    
    if type_ == "collection":
        current_balance += amount
        total_collected += amount
    elif type_ == "withdrawal":
        current_balance -= amount
    elif type_ == "adjustment":
        current_balance += amount
    
    # Update profile
    db.accountant_profiles.update_one(
        {"user_id": user_id, "school_id": school_id},
        {
            "$set": {
                "current_balance": current_balance,
                "total_collected": total_collected,
                "last_updated": datetime.utcnow()
            }
        }
    )
    
    # Record the transaction
    transaction = {
        "accountant_id": user_id,
        "school_id": school_id,
        "amount": amount,
        "type": type_,
        "description": description,
        "recorded_by": recorded_by,
        "created_at": datetime.utcnow(),
    }
    db.accountant_transactions.insert_one(transaction)
    logger.info(f"[SCHOOL:{school_id}] ✅ Balance updated: {type_} of {amount}")
    
    return True

def get_accountant_daily_summary(user_id: str, date_str: str, school_id: str = None) -> Optional[dict]:
    """Get daily summary for accountant"""
    if not school_id:
        logger.error("❌ Cannot get daily summary without schoolId")
        return None
    
    db = get_db()
    
    # Get collections for the day
    start_date = datetime.strptime(date_str, "%Y-%m-%d")
    end_date = start_date.replace(hour=23, minute=59, second=59)
    
    pipeline = [
        {"$match": {
            "school_id": school_id,
            "received_by": user_id,
            "paid_at": {"$gte": start_date, "$lte": end_date}
        }},
        {"$group": {
            "_id": "$payment_method",
            "total": {"$sum": "$amount_paid"}
        }}
    ]
    
    collections = {}
    results = list(db.fee_payments.aggregate(pipeline))
    for result in results:
        collections[result["_id"]] = result["total"]
    
    total_collected = sum(collections.values())
    
    # Get opening balance (from previous day's closing or profile opening)
    profile = get_accountant_profile(user_id, school_id=school_id)
    opening_balance = profile.get("opening_balance", 0.0) if profile else 0.0
    
    # Check if there's a previous summary
    prev_date = start_date - timedelta(days=1)
    prev_summary = db.accountant_daily_summaries.find_one({
        "school_id": school_id,
        "accountant_id": user_id,
        "date": prev_date.strftime("%Y-%m-%d")
    })
    if prev_summary:
        opening_balance = prev_summary.get("closing_balance", opening_balance)
    
    closing_balance = opening_balance + total_collected
    
    summary = {
        "school_id": school_id,
        "accountant_id": user_id,
        "date": date_str,
        "opening_balance": opening_balance,
        "collections": collections,
        "total_collected": total_collected,
        "closing_balance": closing_balance,
        "verified": False
    }
    
    # Save or update summary
    existing = db.accountant_daily_summaries.find_one({
        "school_id": school_id,
        "accountant_id": user_id,
        "date": date_str
    })
    
    if existing:
        db.accountant_daily_summaries.update_one(
            {"_id": existing["_id"]},
            {"$set": summary}
        )
        summary["id"] = str(existing["_id"])
    else:
        result = db.accountant_daily_summaries.insert_one(summary)
        summary["id"] = str(result.inserted_id)
    
    logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved daily summary: {total_collected} collected")
    return summary

def verify_daily_summary(summary_id: str, verified_by: str, school_id: str = None) -> bool:
    """Verify daily summary"""
    if not school_id:
        logger.error("❌ Cannot verify summary without schoolId")
        return False
    
    db = get_db()
    
    result = db.accountant_daily_summaries.update_one(
        {"_id": ObjectId(summary_id), "school_id": school_id},
        {
            "$set": {
                "verified": True,
                "verified_at": datetime.utcnow(),
                "verified_by": verified_by
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"[SCHOOL:{school_id}] ✅ Daily summary verified")
        return True
    logger.error(f"[SCHOOL:{school_id}] ❌ Failed to verify summary")
    return False

def get_accountant_transactions(user_id: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, school_id: str = None) -> List[dict]:
    """Get accountant transactions"""
    if not school_id:
        logger.error("❌ Cannot get transactions without schoolId")
        return []
    
    db = get_db()
    
    query = {"accountant_id": user_id, "school_id": school_id}
    if start_date and end_date:
        query["created_at"] = {"$gte": start_date, "$lte": end_date}
    
    transactions = list(db.accountant_transactions.find(query).sort("created_at", -1))
    for tx in transactions:
        tx["id"] = str(tx["_id"])
    
    logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(transactions)} transactions")
    return transactions