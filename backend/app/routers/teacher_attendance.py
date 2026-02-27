from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import logging
from datetime import datetime
from app.dependencies.auth import check_permission
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()

# ================= Models =================

class TeacherAttendanceCreate(BaseModel):
    teacher_id: str
    date: str
    status: str  # 'present', 'absent', 'late'
    check_in_time: Optional[str] = None
    notes: Optional[str] = None

class TeacherAttendanceResponse(BaseModel):
    id: str
    teacher_id: str
    date: str
    status: str
    check_in_time: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

# ================= Endpoints =================

@router.post("/teacher-attendance", response_model=dict)
async def mark_teacher_attendance(
    data: TeacherAttendanceCreate,
    current_user: dict = Depends(check_permission("teachers.update"))
):
    """Mark attendance for a teacher (present/absent/late)"""
    try:
        school_id = current_user.get("school_id")
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        db = get_db()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not available")
        collection = db["teacher_attendance"]
        
        logger.info(f"[SCHOOL:{school_id}] Marking attendance for teacher {data.teacher_id}: {data.status} on {data.date}")
        
        # Check if record exists for this teacher on this date
        existing = collection.find_one({
            "teacher_id": data.teacher_id,
            "date": data.date
        })
        
        record_data = {
            "teacher_id": data.teacher_id,
            "date": data.date,
            "status": data.status,
            "check_in_time": data.check_in_time or datetime.utcnow().isoformat(),
            "notes": data.notes,
            "school_id": school_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if existing:
            # Update existing record
            collection.update_one(
                {"_id": existing["_id"]},
                {"$set": record_data}
            )
            logger.info(f"[SCHOOL:{school_id}] Updated attendance record for teacher {data.teacher_id}")
            return {"message": "Attendance updated", "status": data.status}
        else:
            # Create new record
            record_data["created_at"] = datetime.utcnow().isoformat()
            result = collection.insert_one(record_data)
            logger.info(f"[SCHOOL:{school_id}] Created attendance record for teacher {data.teacher_id}")
            return {"message": "Attendance marked", "id": str(result.inserted_id), "status": data.status}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking teacher attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teacher-attendance/{teacher_id}", response_model=List[dict])
async def get_teacher_attendance(
    teacher_id: str,
    limit: int = 100,
    current_user: dict = Depends(check_permission("teachers.view"))
):
    """Get attendance records for a specific teacher"""
    try:
        school_id = current_user.get("school_id")
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        db = get_db()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not available")
        collection = db["teacher_attendance"]
        
        logger.info(f"[SCHOOL:{school_id}] Fetching attendance for teacher {teacher_id}")
        
        cursor = collection.find(
            {"teacher_id": teacher_id}
        ).sort("date", -1).limit(limit)
        
        records = []
        for doc in cursor:
            records.append({
                "_id": str(doc.get("_id")),
                "teacher_id": doc.get("teacher_id"),
                "date": doc.get("date"),
                "status": doc.get("status"),
                "check_in_time": doc.get("check_in_time"),
                "notes": doc.get("notes"),
                "created_at": doc.get("created_at")
            })
        
        logger.info(f"[SCHOOL:{school_id}] Retrieved {len(records)} attendance records")
        return records
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching teacher attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teacher-attendance/{teacher_id}/stats", response_model=dict)
async def get_teacher_attendance_stats(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.view"))
):
    """Get attendance statistics for a specific teacher"""
    try:
        school_id = current_user.get("school_id")
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        db = get_db()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not available")
        collection = db["teacher_attendance"]
        
        # Count each status
        present_count = collection.count_documents({"teacher_id": teacher_id, "status": "present"})
        late_count = collection.count_documents({"teacher_id": teacher_id, "status": "late"})
        absent_count = collection.count_documents({"teacher_id": teacher_id, "status": "absent"})
        
        total = present_count + late_count + absent_count
        percentage = round(((present_count + late_count) / total) * 100) if total > 0 else 0
        
        return {
            "total": total,
            "present": present_count,
            "late": late_count,
            "absent": absent_count,
            "percentage": percentage
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating teacher attendance stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/all-teachers-attendance", response_model=List[dict])
async def get_all_teachers_attendance(
    date: Optional[str] = None,
    current_user: dict = Depends(check_permission("teachers.view"))
):
    """Get attendance for all teachers on a specific date (default today)"""
    try:
        school_id = current_user.get("school_id")
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        if not date:
            date = datetime.utcnow().strftime("%Y-%m-%d")
        
        db = get_db()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not available")
        collection = db["teacher_attendance"]
        
        logger.info(f"[SCHOOL:{school_id}] Fetching all teachers attendance for {date}")
        
        cursor = collection.find({"date": date})
        
        records = []
        for doc in cursor:
            records.append({
                "_id": str(doc.get("_id")),
                "teacher_id": doc.get("teacher_id"),
                "date": doc.get("date"),
                "status": doc.get("status"),
                "check_in_time": doc.get("check_in_time"),
                "notes": doc.get("notes")
            })
        
        return records
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching all teachers attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
