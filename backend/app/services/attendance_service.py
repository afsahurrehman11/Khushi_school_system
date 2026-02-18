from app.database import get_db
from datetime import datetime
from typing import Optional, List, Dict
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)

# ================= Attendance Operations =================

def create_attendance(school_id: str, class_id: str, student_id: str, date: str, status: str, source: str = "manual", confidence: Optional[float] = None, notes: Optional[str] = None) -> Optional[dict]:
    """Create or update attendance record (UPSERT logic)"""
    if not all([school_id, class_id, student_id, date, status]):
        logger.error("❌ [ATTENDANCE] Missing required fields for attendance record")
        return None
    
    db = get_db()
    
    attendance = {
        "school_id": school_id,
        "class_id": class_id,
        "student_id": student_id,
        "date": date,
        "status": status,
        "source": source,
        "confidence": confidence,
        "notes": notes,
        "updated_at": datetime.utcnow(),
    }
    
    try:
        # UPSERT: Update if exists, create if doesn't
        result = db.attendance.update_one(
            {
                "school_id": school_id,
                "class_id": class_id,
                "student_id": student_id,
                "date": date
            },
            {
                "$set": attendance,
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Fetch the document to return it
        record = db.attendance.find_one({
            "school_id": school_id,
            "class_id": class_id,
            "student_id": student_id,
            "date": date
        })
        
        if record:
            record["id"] = str(record["_id"])
            logger.info(f"🔵 [ATTENDANCE] Marked attendance for student {student_id} on {date}")
            return record
        return None
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error creating attendance: {str(e)}")
        return None


def get_attendance_by_date(school_id: str, class_id: str, date: str) -> List[dict]:
    """Get all attendance records for a class on a specific date"""
    if not all([school_id, class_id, date]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return []
    
    db = get_db()
    try:
        records = list(db.attendance.find({
            "school_id": school_id,
            "class_id": class_id,
            "date": date
        }))
        
        for record in records:
            record["id"] = str(record["_id"])
        
        logger.info(f"🟢 [ATTENDANCE] Class {class_id} - {len(records)} records loaded for {date}")
        return records
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error fetching attendance: {str(e)}")
        return []


def get_attendance_dates(school_id: str, class_id: str, limit: int = 100) -> List[str]:
    """Get list of unique attendance dates for a class (latest first)"""
    if not all([school_id, class_id]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return []
    
    db = get_db()
    try:
        dates = db.attendance.distinct("date", {
            "school_id": school_id,
            "class_id": class_id
        })
        
        # Sort dates in descending order (latest first)
        dates.sort(reverse=True)
        
        logger.info(f"🟢 [ATTENDANCE] Retrieved {len(dates)} unique dates for class {class_id}")
        return dates[:limit]
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error fetching dates: {str(e)}")
        return []


def get_attendance_summary(school_id: str, class_id: str, date: str) -> Dict:
    """Get attendance summary statistics for a class on a specific date"""
    if not all([school_id, class_id, date]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return {}
    
    db = get_db()
    try:
        # Get all students in the class
        students = list(db.students.find({
            "school_id": school_id,
            "class_id": class_id,
            "status": "active"
        }))
        
        total_students = len(students)
        
        # Get attendance records for this date
        attendance_records = list(db.attendance.find({
            "school_id": school_id,
            "class_id": class_id,
            "date": date
        }))
        
        # Count by status
        status_count = {}
        for record in attendance_records:
            status = record.get("status", "absent")
            status_count[status] = status_count.get(status, 0) + 1
        
        present_count = status_count.get("present", 0)
        absent_count = status_count.get("absent", 0)
        late_count = status_count.get("late", 0)
        
        # Calculate attendance percentage (present + late)
        marked_count = present_count + late_count
        attendance_percentage = (marked_count / total_students * 100) if total_students > 0 else 0
        
        summary = {
            "date": date,
            "total_students": total_students,
            "present_count": present_count,
            "absent_count": absent_count,
            "late_count": late_count,
            "attendance_percentage": round(attendance_percentage, 2)
        }
        
        logger.info(f"📊 [ATTENDANCE] Summary for {date}: {present_count}P, {absent_count}A, {late_count}L out of {total_students}")
        return summary
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error calculating summary: {str(e)}")
        return {}


def get_attendance_record(school_id: str, class_id: str, student_id: str, date: str) -> Optional[dict]:
    """Get a specific attendance record"""
    if not all([school_id, class_id, student_id, date]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return None
    
    db = get_db()
    try:
        record = db.attendance.find_one({
            "school_id": school_id,
            "class_id": class_id,
            "student_id": student_id,
            "date": date
        })
        
        if record:
            record["id"] = str(record["_id"])
            logger.info(f"🟢 [ATTENDANCE] Retrieved record for student {student_id} on {date}")
        return record
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error fetching record: {str(e)}")
        return None


def get_attendance_by_student(school_id: str, student_id: str, from_date: Optional[str] = None, to_date: Optional[str] = None, limit: int = 100) -> List[dict]:
    """Get all attendance records for a student within date range"""
    if not all([school_id, student_id]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return []
    
    db = get_db()
    try:
        query = {
            "school_id": school_id,
            "student_id": student_id
        }
        
        if from_date or to_date:
            date_query = {}
            if from_date:
                date_query["$gte"] = from_date
            if to_date:
                date_query["$lte"] = to_date
            if date_query:
                query["date"] = date_query
        
        records = list(db.attendance.find(query).sort("date", -1).limit(limit))
        
        for record in records:
            record["id"] = str(record["_id"])
        
        logger.info(f"🟢 [ATTENDANCE] Retrieved {len(records)} records for student {student_id}")
        return records
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error fetching student attendance: {str(e)}")
        return []


def mark_face_attendance(school_id: str, class_id: str, student_id: str, date: str, confidence: float) -> Optional[dict]:
    """Mark attendance from face recognition system"""
    if not all([school_id, class_id, student_id, date]) or confidence is None:
        logger.error("❌ [ATTENDANCE] Missing required fields for face attendance")
        return None
    
    # Mark as present with source='face'
    return create_attendance(
        school_id=school_id,
        class_id=class_id,
        student_id=student_id,
        date=date,
        status="present",
        source="face",
        confidence=confidence
    )


def get_class_attendance_stats(school_id: str, class_id: str, num_days: int = 30) -> Dict:
    """Get aggregate attendance stats for a class over the last N days"""
    if not all([school_id, class_id]):
        logger.error("❌ [ATTENDANCE] Missing required parameters")
        return {}
    
    db = get_db()
    try:
        pipeline = [
            {
                "$match": {
                    "school_id": school_id,
                    "class_id": class_id
                }
            },
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        results = list(db.attendance.aggregate(pipeline))
        
        stats = {
            "present": 0,
            "absent": 0,
            "late": 0,
            "total_records": 0
        }
        
        for result in results:
            status = result.get("_id", "absent")
            count = result.get("count", 0)
            if status in stats:
                stats[status] = count
            stats["total_records"] += count
        
        logger.info(f"📊 [ATTENDANCE] Class {class_id} stats: {stats}")
        return stats
    except Exception as e:
        logger.error(f"🔴 [ATTENDANCE] Error calculating stats: {str(e)}")
        return {}
