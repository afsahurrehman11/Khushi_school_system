"""
Fee Statistics Service
Provides aggregated fee and payment statistics for accountants and admins
"""
from app.database import get_db
from typing import Dict, List
from bson import ObjectId
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


def get_fee_collection_stats(school_id: str) -> Dict:
    """
    Get comprehensive fee collection statistics
    Returns:
    - Total students
    - Fee status breakdown (paid/partial/unpaid)
    - Total collected amount
    - Total pending amount
    - Collection by class
    """
    db = get_db()
    
    try:
        # Get all students for the school
        students = list(db.students.find({"school_id": school_id}))
        total_students = len(students)
        
        # Initialize counters
        stats = {
            "total_students": total_students,
            "paid_count": 0,
            "partial_count": 0,
            "unpaid_count": 0,
            "total_collected": 0,
            "total_pending": 0,
            "total_expected": 0,
            "collection_by_class": {},
            "recent_payments": []
        }
        
        # Get fee assignments and payments for each student
        for student in students:
            student_id = str(student["_id"])
            class_id = student.get("class_id")
            
            # Get student's fee category through class assignment
            assignment = db.class_fee_assignments.find_one({
                "class_id": class_id,
                "is_active": True
            })
            
            expected_fee = 0
            if assignment:
                category = db.fee_categories.find_one({"_id": ObjectId(assignment["category_id"])})
                if category:
                    if "total_amount" in category:
                        expected_fee = category.get("total_amount", 0)
                    elif "components" in category:
                        expected_fee = sum(c.get("amount", 0) for c in category.get("components", []))
            
            # Get total paid for this student
            pipeline = [
                {"$match": {"student_id": student_id}},
                {"$group": {"_id": None, "total_paid": {"$sum": "$amount_paid"}}}
            ]
            result = list(db.fee_payments.aggregate(pipeline))
            paid_amount = result[0]["total_paid"] if result else 0
            
            # Determine status
            if paid_amount == 0:
                stats["unpaid_count"] += 1
                status = "unpaid"
            elif paid_amount >= expected_fee:
                stats["paid_count"] += 1
                status = "paid"
            else:
                stats["partial_count"] += 1
                status = "partial"
            
            stats["total_collected"] += paid_amount
            stats["total_expected"] += expected_fee
            stats["total_pending"] += max(0, expected_fee - paid_amount)
            
            # Collection by class
            if class_id:
                if class_id not in stats["collection_by_class"]:
                    class_info = db.classes.find_one({"_id": ObjectId(class_id)})
                    stats["collection_by_class"][class_id] = {
                        "class_name": class_info.get("class_name") if class_info else "Unknown",
                        "total_students": 0,
                        "paid": 0,
                        "partial": 0,
                        "unpaid": 0,
                        "collected": 0,
                        "expected": 0
                    }
                
                stats["collection_by_class"][class_id]["total_students"] += 1
                stats["collection_by_class"][class_id][status] += 1
                stats["collection_by_class"][class_id]["collected"] += paid_amount
                stats["collection_by_class"][class_id]["expected"] += expected_fee
        
        # Get recent payments (last 20)
        recent_payments = list(db.fee_payments.find(
            {"school_id": school_id}
        ).sort("paid_at", -1).limit(20))
        
        for payment in recent_payments:
            student = db.students.find_one({"_id": ObjectId(payment["student_id"])})
            stats["recent_payments"].append({
                "id": str(payment["_id"]),
                "student_name": student.get("full_name") if student else "Unknown",
                "amount": payment.get("amount_paid", 0),
                "payment_method": payment.get("payment_method", "Unknown"),
                "paid_at": payment.get("paid_at").isoformat() if payment.get("paid_at") else None
            })
        
        # Convert collection_by_class dict to list for easier frontend consumption
        stats["collection_by_class"] = list(stats["collection_by_class"].values())
        
        # Calculate collection rate
        if stats["total_expected"] > 0:
            stats["collection_rate"] = (stats["total_collected"] / stats["total_expected"]) * 100
        else:
            stats["collection_rate"] = 0
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get fee collection stats: {str(e)}")
        raise


def get_payment_method_breakdown(school_id: str) -> List[Dict]:
    """
    Get breakdown of payments by payment method
    """
    db = get_db()
    
    try:
        pipeline = [
            {"$match": {"school_id": school_id}},
            {
                "$group": {
                    "_id": "$payment_method",
                    "count": {"$sum": 1},
                    "total_amount": {"$sum": "$amount_paid"}
                }
            },
            {"$sort": {"total_amount": -1}}
        ]
        
        results = list(db.fee_payments.aggregate(pipeline))
        
        breakdown = []
        for result in results:
            breakdown.append({
                "method": result["_id"] or "Unknown",
                "count": result["count"],
                "amount": result["total_amount"]
            })
        
        return breakdown
        
    except Exception as e:
        logger.error(f"Failed to get payment method breakdown: {str(e)}")
        raise


def get_daily_collections(school_id: str, days: int = 30) -> List[Dict]:
    """
    Get daily collection history for the last N days
    """
    db = get_db()
    
    try:
        from datetime import datetime, timedelta
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "paid_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$paid_at"}
                    },
                    "total_amount": {"$sum": "$amount_paid"},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        results = list(db.fee_payments.aggregate(pipeline))
        
        daily_collections = []
        for result in results:
            daily_collections.append({
                "date": result["_id"],
                "amount": result["total_amount"],
                "count": result["count"]
            })
        
        return daily_collections
        
    except Exception as e:
        logger.error(f"Failed to get daily collections: {str(e)}")
        raise
