"""
Analytics Router
API endpoints for real-time dashboard analytics from tenant database
All data is strictly tenant-isolated using school_id from authenticated user
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import logging

from app.dependencies.auth import check_permission
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ================= Helper Functions =================

def get_date_range(period: str) -> tuple:
    """Get date range for analytics queries"""
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if period == "today":
        return today, now
    elif period == "week":
        return today - timedelta(days=7), now
    elif period == "month":
        return today - timedelta(days=30), now
    elif period == "year":
        return today - timedelta(days=365), now
    else:
        return today - timedelta(days=30), now


# ================= Dashboard Overview =================

@router.get("/dashboard/overview")
async def get_dashboard_overview(
    current_user: dict = Depends(check_permission("dashboard.read"))
):
    """Get comprehensive dashboard overview with real data"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        
        # Student statistics
        total_students = db.students.count_documents({
            "school_id": school_id,
            "status": "active"
        })
        
        # Gender distribution
        gender_pipeline = [
            {"$match": {"school_id": school_id, "status": "active"}},
            {"$group": {"_id": "$gender", "count": {"$sum": 1}}}
        ]
        gender_data = list(db.students.aggregate(gender_pipeline))
        gender_distribution = {item["_id"]: item["count"] for item in gender_data}
        
        # Students per class
        class_pipeline = [
            {"$match": {"school_id": school_id, "status": "active"}},
            {"$group": {"_id": "$class_id", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        students_per_class = list(db.students.aggregate(class_pipeline))
        
        # Teacher/Staff statistics
        total_teachers = db.teachers.count_documents({"school_id": school_id})
        
        # Class count
        total_classes = db.classes.count_documents({"school_id": school_id})
        
        # Missing data summary
        missing_photos = db.students.count_documents({
            "school_id": school_id,
            "status": "active",
            "$or": [
                {"profile_image_blob": {"$exists": False}},
                {"profile_image_blob": None}
            ]
        })
        
        missing_guardian = db.students.count_documents({
            "school_id": school_id,
            "status": "active",
            "$or": [
                {"guardian_info": {"$exists": False}},
                {"guardian_info.father_name": None},
                {"guardian_info.father_name": ""}
            ]
        })
        
        missing_contact = db.students.count_documents({
            "school_id": school_id,
            "status": "active",
            "$or": [
                {"contact_info": {"$exists": False}},
                {"contact_info.phone": None},
                {"contact_info.phone": ""}
            ]
        })
        
        return {
            "students": {
                "total": total_students,
                "gender_distribution": gender_distribution,
                "per_class": students_per_class,
                "missing_photos": missing_photos,
                "missing_guardian": missing_guardian,
                "missing_contact": missing_contact
            },
            "teachers": {
                "total": total_teachers
            },
            "classes": {
                "total": total_classes
            },
            "last_updated": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting dashboard overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Attendance Analytics =================

@router.get("/attendance/summary")
async def get_attendance_summary(
    period: str = "month",
    class_id: Optional[str] = None,
    current_user: dict = Depends(check_permission("attendance.read"))
):
    """Get attendance summary with trends"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        start_date, end_date = get_date_range(period)
        
        # Base match filter
        match_filter = {
            "school_id": school_id,
            "date": {"$gte": start_date, "$lte": end_date}
        }
        if class_id:
            match_filter["class_id"] = class_id
        
        # Overall attendance stats
        attendance_pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        attendance_stats = list(db.attendance.aggregate(attendance_pipeline))
        stats_dict = {item["_id"]: item["count"] for item in attendance_stats}
        
        total = sum(stats_dict.values())
        present = stats_dict.get("present", 0) + stats_dict.get("late", 0)
        absent = stats_dict.get("absent", 0)
        late = stats_dict.get("late", 0)
        
        # Daily trend
        daily_pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                "present": {"$sum": {"$cond": [{"$in": ["$status", ["present", "late"]]}, 1, 0]}},
                "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                "total": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}},
            {"$limit": 30}
        ]
        
        daily_trend = list(db.attendance.aggregate(daily_pipeline))
        
        return {
            "summary": {
                "total_records": total,
                "present": present,
                "absent": absent,
                "late": late,
                "attendance_rate": round((present / max(total, 1)) * 100, 2)
            },
            "daily_trend": daily_trend,
            "period": period
        }
        
    except Exception as e:
        logger.error(f"Error getting attendance summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/class-wise")
async def get_attendance_class_wise(
    date: Optional[str] = None,
    current_user: dict = Depends(check_permission("attendance.read"))
):
    """Get class-wise attendance for a specific date"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        
        # Use today if no date specified
        if date:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        else:
            target_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        next_day = target_date + timedelta(days=1)
        
        # Get class-wise attendance
        pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "date": {"$gte": target_date, "$lt": next_day}
                }
            },
            {
                "$group": {
                    "_id": "$class_id",
                    "present": {"$sum": {"$cond": [{"$in": ["$status", ["present", "late"]]}, 1, 0]}},
                    "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                    "late": {"$sum": {"$cond": [{"$eq": ["$status", "late"]}, 1, 0]}},
                    "total": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        class_attendance = list(db.attendance.aggregate(pipeline))
        
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "classes": class_attendance
        }
        
    except Exception as e:
        logger.error(f"Error getting class-wise attendance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Fee Analytics =================

@router.get("/fees/summary")
async def get_fee_summary(
    period: str = "month",
    current_user: dict = Depends(check_permission("fees.read"))
):
    """Get fee collection summary with trends"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        start_date, end_date = get_date_range(period)
        
        # Overall fee stats
        fee_pipeline = [
            {"$match": {"school_id": school_id}},
            {"$group": {
                "_id": "$status",
                "total_amount": {"$sum": "$amount"},
                "paid_amount": {"$sum": "$amount_paid"},
                "count": {"$sum": 1}
            }}
        ]
        
        fee_stats = list(db.fee_records.aggregate(fee_pipeline))
        
        total_due = 0
        total_paid = 0
        pending_count = 0
        paid_count = 0
        
        for stat in fee_stats:
            total_due += stat.get("total_amount", 0)
            total_paid += stat.get("paid_amount", 0)
            if stat["_id"] in ["pending", "unpaid", "partial"]:
                pending_count += stat["count"]
            if stat["_id"] == "paid":
                paid_count += stat["count"]
        
        # Collection trend
        collection_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "paid_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$paid_at"}},
                    "collected": {"$sum": "$amount_paid"}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        collection_trend = list(db.fee_records.aggregate(collection_pipeline))
        
        # Class-wise pending
        class_pending_pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "status": {"$in": ["pending", "unpaid", "partial"]}
                }
            },
            {
                "$group": {
                    "_id": "$class_id",
                    "pending_amount": {"$sum": {"$subtract": ["$amount", {"$ifNull": ["$amount_paid", 0]}]}},
                    "student_count": {"$addToSet": "$student_id"}
                }
            },
            {
                "$project": {
                    "pending_amount": 1,
                    "student_count": {"$size": "$student_count"}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        class_pending = list(db.fee_records.aggregate(class_pending_pipeline))
        
        return {
            "summary": {
                "total_due": total_due,
                "total_paid": total_paid,
                "total_pending": total_due - total_paid,
                "collection_rate": round((total_paid / max(total_due, 1)) * 100, 2),
                "pending_students": pending_count,
                "paid_students": paid_count
            },
            "collection_trend": collection_trend,
            "class_pending": class_pending,
            "period": period
        }
        
    except Exception as e:
        logger.error(f"Error getting fee summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Student Analytics =================

@router.get("/students/missing-data")
async def get_students_missing_data(
    class_id: Optional[str] = None,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get students with missing data grouped by class"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        
        # Base filter
        match_filter = {"school_id": school_id, "status": "active"}
        if class_id:
            match_filter["class_id"] = class_id
        
        # Get all active students
        students = list(db.students.find(match_filter))
        
        # Group by class and find missing data
        classes_data = {}
        
        for student in students:
            cls_id = student.get("class_id", "Unknown")
            
            if cls_id not in classes_data:
                classes_data[cls_id] = {
                    "class_id": cls_id,
                    "students": [],
                    "missing_counts": {
                        "photo": 0,
                        "guardian_info": 0,
                        "contact_info": 0,
                        "date_of_birth": 0,
                        "cnic": 0
                    }
                }
            
            # Check for missing data
            missing = []
            
            # Photo
            if not student.get("profile_image_blob"):
                missing.append("photo")
                classes_data[cls_id]["missing_counts"]["photo"] += 1
            
            # Guardian info
            guardian = student.get("guardian_info", {})
            if not guardian or not guardian.get("father_name"):
                missing.append("guardian_info")
                classes_data[cls_id]["missing_counts"]["guardian_info"] += 1
            
            # Contact info
            contact = student.get("contact_info", {})
            if not contact or not contact.get("phone"):
                missing.append("contact_info")
                classes_data[cls_id]["missing_counts"]["contact_info"] += 1
            
            # Date of birth
            if not student.get("date_of_birth"):
                missing.append("date_of_birth")
                classes_data[cls_id]["missing_counts"]["date_of_birth"] += 1
            
            # CNIC (optional but track it)
            if not student.get("cnic_image_blob"):
                classes_data[cls_id]["missing_counts"]["cnic"] += 1
            
            if missing:
                classes_data[cls_id]["students"].append({
                    "id": str(student["_id"]),
                    "student_id": student.get("student_id"),
                    "full_name": student.get("full_name"),
                    "roll_number": student.get("roll_number"),
                    "missing_fields": missing
                })
        
        return {
            "classes": list(classes_data.values()),
            "total_with_missing": sum(len(c["students"]) for c in classes_data.values())
        }
        
    except Exception as e:
        logger.error(f"Error getting missing data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/students/enrollment-trend")
async def get_enrollment_trend(
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get student enrollment trend by admission date"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        
        # Monthly enrollment
        pipeline = [
            {"$match": {"school_id": school_id}},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": {"$dateFromString": {"dateString": "$admission_date"}}},
                        "month": {"$month": {"$dateFromString": {"dateString": "$admission_date"}}}
                    },
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}},
            {"$limit": 24}
        ]
        
        enrollment_data = list(db.students.aggregate(pipeline))
        
        # Format for chart
        trend = []
        for item in enrollment_data:
            year = item["_id"].get("year", 2024)
            month = item["_id"].get("month", 1)
            trend.append({
                "period": f"{year}-{month:02d}",
                "enrollments": item["count"]
            })
        
        return {"trend": trend}
        
    except Exception as e:
        logger.error(f"Error getting enrollment trend: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Face Recognition Analytics =================

@router.get("/face-recognition/status")
async def get_face_recognition_status(
    current_user: dict = Depends(check_permission("attendance.read"))
):
    """Get face recognition registration status"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        
        # Student embedding status
        student_pipeline = [
            {"$match": {"school_id": school_id, "status": "active"}},
            {"$group": {
                "_id": "$embedding_status",
                "count": {"$sum": 1}
            }}
        ]
        
        student_stats = list(db.students.aggregate(student_pipeline))
        student_status = {item["_id"] or "pending": item["count"] for item in student_stats}
        
        # Class-wise breakdown
        class_pipeline = [
            {"$match": {"school_id": school_id, "status": "active"}},
            {"$group": {
                "_id": "$class_id",
                "total": {"$sum": 1},
                "ready": {"$sum": {"$cond": [{"$eq": ["$embedding_status", "generated"]}, 1, 0]}},
                "pending": {"$sum": {"$cond": [{"$in": ["$embedding_status", [None, "pending"]]}, 1, 0]}},
                "failed": {"$sum": {"$cond": [{"$eq": ["$embedding_status", "failed"]}, 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        class_stats = list(db.students.aggregate(class_pipeline))
        
        return {
            "students": {
                "generated": student_status.get("generated", 0),
                "pending": student_status.get("pending", 0) + student_status.get(None, 0),
                "failed": student_status.get("failed", 0)
            },
            "by_class": class_stats
        }
        
    except Exception as e:
        logger.error(f"Error getting face recognition status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
