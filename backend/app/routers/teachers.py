from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import List, Optional
from app.models.teacher import TeacherSchema, TeacherInDB, TeacherCreate, TeacherUpdate
from app.services.teacher import (
    create_teacher, get_all_teachers, get_teacher_by_id,
    get_teacher_by_teacher_id, update_teacher, delete_teacher
)
from app.services.teacher_image_service import TeacherImageService
from app.dependencies.auth import check_permission
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/teachers", response_model=List[TeacherInDB])
async def list_teachers(
    current_user: dict = Depends(check_permission("teachers.read"))
):
    """Get all teachers (school-isolated for non-Root)"""
    try:
        school_id = current_user.get("school_id")
        admin_email = current_user.get("email")
        
        logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching teachers")
        
        teachers = get_all_teachers(school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(teachers)} teachers")
        return teachers
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'N/A'}] ❌ Failed to fetch teachers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teachers/{teacher_id}", response_model=TeacherInDB)
async def get_teacher(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.read"))
):
    """Get teacher by ID (school-isolated for non-Root)"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id or 'All'}] Fetching teacher: {teacher_id}")
        
        teacher = get_teacher_by_id(teacher_id, school_id=school_id)
        if not teacher:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Teacher not found: {teacher_id}")
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        return teacher
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'N/A'}] ❌ Failed to fetch teacher: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teachers", response_model=TeacherInDB)
async def create_new_teacher(
    teacher_data: TeacherCreate,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    """Create a new teacher (school-isolated)"""
    try:
        school_id = current_user.get("school_id")
        admin_email = current_user.get("email")
        
        logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating teacher: {teacher_data.name}")
        
        # Convert to dict and inject school_id
        teacher_dict = teacher_data.dict(exclude_unset=True)
        teacher_dict["school_id"] = school_id
        
        # Handle frontend compatibility aliases
        if "teacherId" in teacher_dict and "teacher_id" not in teacher_dict:
            teacher_dict["teacher_id"] = teacher_dict.pop("teacherId")
        
        if "subjects" in teacher_dict and "assigned_subjects" not in teacher_dict:
            teacher_dict["assigned_subjects"] = teacher_dict.pop("subjects")
        
        # Remove fields not in TeacherSchema
        teacher_dict.pop("dateOfJoining", None)
        teacher_dict.pop("date_of_joining", None)
        teacher_dict.pop("teacherId", None)  # Already handled
        teacher_dict.pop("subjects", None)    # Already handled
        
        teacher = create_teacher(teacher_dict)
        if not teacher:
            logger.warning(f"[SCHOOL:{school_id}] Teacher creation failed - invalid data or duplicate")
            raise HTTPException(status_code=400, detail="Teacher already exists or invalid data")
        
        return teacher
    except HTTPException:
        raise
    except Exception as e:
        school_id = current_user.get("school_id")
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create teacher: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/teachers/{teacher_id}", response_model=TeacherInDB)
async def update_existing_teacher(
    teacher_id: str,
    teacher_data: TeacherUpdate,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    """Update teacher (school-isolated)"""
    try:
        school_id = current_user.get("school_id")
        admin_email = current_user.get("email")
        
        logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating teacher: {teacher_id}")
        
        update_data = teacher_data.dict(exclude_unset=True)
        teacher = update_teacher(teacher_id, school_id=school_id, **update_data)
        if not teacher:
            logger.warning(f"[SCHOOL:{school_id}] Teacher not found: {teacher_id}")
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        return teacher
    except HTTPException:
        raise
    except Exception as e:
        school_id = current_user.get("school_id")
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update teacher: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/teachers/{teacher_id}")
async def delete_existing_teacher(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    """Delete teacher (school-isolated)"""
    try:
        school_id = current_user.get("school_id")
        admin_email = current_user.get("email")
        
        logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting teacher: {teacher_id}")
        
        if not delete_teacher(teacher_id, school_id=school_id):
            logger.warning(f"[SCHOOL:{school_id}] Teacher not found: {teacher_id}")
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Teacher deleted: {teacher_id}")
        return {"message": "Teacher deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        school_id = current_user.get("school_id")
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete teacher: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Image Upload Endpoints ============

@router.post("/teachers/{teacher_id}/image")
async def upload_teacher_image(
    teacher_id: str,
    image: UploadFile = File(...),
    current_user: dict = Depends(check_permission("teachers.write"))
):
    """Upload profile image for a teacher"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"🔵 [UPLOAD] Uploading image for teacher: {teacher_id}")
        
        # Read image content
        file_content = await image.read()
        
        result = await TeacherImageService.upload_teacher_image(
            teacher_id=teacher_id,
            file_content=file_content,
            file_name=image.filename,
            school_id=school_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Upload failed"))
        
        logger.info(f"🟢 [UPLOAD] Image uploaded successfully for teacher: {teacher_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error uploading image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/teachers/{teacher_id}/image")
async def delete_teacher_image(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    """Delete profile image for a teacher"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"🔵 [DELETE] Deleting image for teacher: {teacher_id}")
        
        result = await TeacherImageService.delete_teacher_image(
            teacher_id=teacher_id,
            school_id=school_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Delete failed"))
        
        logger.info(f"🟢 [DELETE] Image deleted successfully for teacher: {teacher_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error deleting image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
