from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import logging
from app.models.attendance import (
    AttendanceSchema, AttendanceInDB, AttendanceUpdate, 
    AttendanceResponse, AttendanceSummary
)
from app.services.attendance_service import (
    create_attendance, get_attendance_by_date, get_attendance_dates,
    get_attendance_summary, get_attendance_record, get_attendance_by_student,
    mark_face_attendance, get_class_attendance_stats
)
from app.dependencies.auth import check_permission
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

# ================= Attendance Endpoints =================

@router.get("/attendance/{class_id}", response_model=List[str])
async def get_attendance_dates_endpoint(
    class_id: str,
    limit: int = 100,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get list of attendance dates for a class (latest first)"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 🔍 Fetching attendance dates for class {class_id}")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        dates = get_attendance_dates(school_id, class_id, limit)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(dates)} attendance dates")
        return dates
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching attendance dates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/{class_id}/{date}", response_model=List[AttendanceResponse])
async def get_attendance_for_date(
    class_id: str,
    date: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get all attendance records for a class on a specific date"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 🔍 Fetching attendance for class {class_id} on {date}")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        records = get_attendance_by_date(school_id, class_id, date)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(records)} attendance records")
        return records
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/{class_id}/{date}/summary", response_model=AttendanceSummary)
async def get_attendance_summary_endpoint(
    class_id: str,
    date: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get attendance summary statistics for a class on a specific date"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 📊 Fetching attendance summary for class {class_id} on {date}")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        summary = get_attendance_summary(school_id, class_id, date)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not available")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Summary generated")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error generating summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance", response_model=AttendanceResponse)
async def mark_attendance(
    attendance_data: dict,
    current_user: dict = Depends(check_permission("academics.manage_attendance"))
):
    """Mark or update attendance for a student (manual marking)"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 📝 Marking attendance")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        # Extract required fields
        class_id = attendance_data.get("class_id")
        student_id = attendance_data.get("student_id")
        date = attendance_data.get("date")
        status = attendance_data.get("status")
        notes = attendance_data.get("notes")
        
        if not all([class_id, student_id, date, status]):
            raise HTTPException(status_code=400, detail="Missing required fields: class_id, student_id, date, status")
        
        # Validate status
        if status not in ["present", "absent", "late"]:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'present', 'absent', or 'late'")
        
        record = create_attendance(
            school_id=school_id,
            class_id=class_id,
            student_id=student_id,
            date=date,
            status=status,
            source="manual",
            notes=notes
        )
        
        if not record:
            raise HTTPException(status_code=500, detail="Failed to create attendance record")
        
        logger.info(f"🔵 [ATTENDANCE] Marked {status} for student {student_id} on {date}")
        return record
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error marking attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/face-mark")
async def mark_face_attendance_endpoint(
    attendance_data: dict,
    current_user: dict = Depends(check_permission("academics.manage_attendance"))
):
    """Mark attendance from face recognition system"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 🟢 Face attendance marking initiated")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        # Extract required fields for face recognition
        class_id = attendance_data.get("class_id")
        student_id = attendance_data.get("student_id")
        date = attendance_data.get("date", datetime.now().strftime("%Y-%m-%d"))
        confidence = attendance_data.get("confidence")
        
        if not all([class_id, student_id, confidence is not None]):
            raise HTTPException(status_code=400, detail="Missing required fields: class_id, student_id, confidence")
        
        # Validate confidence is between 0 and 1
        if not (0 <= confidence <= 1):
            raise HTTPException(status_code=400, detail="Confidence must be between 0 and 1")
        
        record = mark_face_attendance(
            school_id=school_id,
            class_id=class_id,
            student_id=student_id,
            date=date,
            confidence=confidence
        )
        
        if not record:
            raise HTTPException(status_code=500, detail="Failed to mark face attendance")
        
        logger.info(f"🟢 [ATTENDANCE] Face attendance marked for student {student_id} (confidence: {confidence})")
        return {
            "success": True,
            "message": "Attendance marked from face recognition",
            "record": record
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error marking face attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/student/{student_id}")
async def get_student_attendance(
    student_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get all attendance records for a student"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 🔍 Fetching attendance for student {student_id}")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        records = get_attendance_by_student(
            school_id=school_id,
            student_id=student_id,
            from_date=from_date,
            to_date=to_date
        )
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(records)} records for student")
        return records
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching student attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/class/{class_id}/stats")
async def get_class_stats(
    class_id: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get aggregate attendance statistics for a class"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] 📊 Fetching attendance stats for class {class_id}")
        
        if not school_id:
            raise HTTPException(status_code=403, detail="School ID required")
        
        stats = get_class_attendance_stats(school_id, class_id)
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Stats generated for class {class_id}")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching class stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
