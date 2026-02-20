"""
Face Recognition Router
API endpoints for face recognition attendance system
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
import logging

from ..database import get_db
from ..dependencies.auth import get_current_user, get_current_admin
from ..services.face_service import (
    FaceRecognitionService,
    EmbeddingGenerationService,
    FaceSettingsService
)

logger = logging.getLogger('face')

router = APIRouter(prefix="/api/face", tags=["Face Recognition"])


# Request/Response models
class RecognizeResponse(BaseModel):
    status: str  # "success" | "retry" | "error"
    reason: Optional[str] = None
    message: Optional[str] = None
    match: Optional[dict] = None
    attendance: Optional[dict] = None


class SettingsUpdate(BaseModel):
    school_start_time: Optional[str] = None
    late_after_time: Optional[str] = None
    auto_absent_time: Optional[str] = None
    employee_checkin_time: Optional[str] = None
    employee_late_after: Optional[str] = None
    employee_checkout_time: Optional[str] = None
    confidence_threshold: Optional[float] = None
    max_retry_attempts: Optional[int] = None
    students_enabled: Optional[bool] = None
    employees_enabled: Optional[bool] = None


class GenerateRequest(BaseModel):
    person_type: str  # "student" | "employee"
    class_id: Optional[str] = None


class RegenerateSingleRequest(BaseModel):
    person_type: str
    person_id: str


# ============ Status & Health ============

@router.get("/status")
async def get_status(db=Depends(get_db)):
    """Get face recognition system status (public endpoint)"""
    from ..services.face_service import USE_FACENET, DEVICE, _cache_loaded, _embedding_cache
    
    return {
        "facenet_available": USE_FACENET,
        "device": str(DEVICE) if DEVICE else "cpu",
        "cache_loaded": _cache_loaded,
        "cached_students": len(_embedding_cache["students"]),
        "cached_employees": len(_embedding_cache["employees"]),
        "ready": True
    }


# ============ Dashboard ============

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_admin)
):
    """Get dashboard statistics (admin only)"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    return await face_service.get_dashboard_stats(school_id)


@router.get("/dashboard/activity")
async def get_today_activity(
    limit: int = 50,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_admin)
):
    """Get today's face recognition activity (admin only)"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    activities = await face_service.get_today_activity(school_id, limit)
    return {"activities": activities}


# ============ Recognition ============

@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_face(
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Process face recognition from captured image.
    Returns match or retry instruction.
    """
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    # Read image data
    image_data = await file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="Empty image")
    
    logger.info(f"[FACE] Recognition request: {len(image_data)} bytes")
    
    # Get settings
    settings_service = FaceSettingsService(db)
    settings = await settings_service.get_settings(school_id)
    
    # Process recognition
    face_service = FaceRecognitionService(db)
    result = await face_service.process_recognition(image_data, school_id, settings)
    
    if result["status"] == "success":
        # Record attendance
        attendance = await face_service.record_attendance(
            result["match"],
            school_id,
            settings
        )
        result["attendance"] = attendance
    
    return result


@router.post("/load-cache")
async def load_embeddings_cache(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Load embeddings into memory cache"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    counts = await face_service.load_embeddings_to_cache(school_id)
    
    return {
        "success": True,
        "loaded": counts
    }


# ============ Embedding Generation ============

@router.post("/generate/missing")
async def generate_missing_embeddings(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate embeddings for records that don't have them.
    User-friendly: "Prepare Missing Faces"
    """
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    embedding_service = EmbeddingGenerationService(db, face_service)
    
    logger.info(f"[FACE] Generating missing embeddings for {request.person_type}")
    
    # Run in background for bulk operations
    result = await embedding_service.generate_missing_embeddings(
        school_id,
        request.person_type,
        request.class_id
    )
    
    return result


@router.post("/generate/refresh")
async def refresh_all_embeddings(
    request: GenerateRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Regenerate ALL embeddings.
    User-friendly: "Refresh All Faces"
    """
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    embedding_service = EmbeddingGenerationService(db, face_service)
    
    logger.info(f"[FACE] Refreshing all embeddings for {request.person_type}")
    
    result = await embedding_service.regenerate_all_embeddings(
        school_id,
        request.person_type,
        request.class_id
    )
    
    return result


@router.post("/generate/single")
async def regenerate_single_embedding(
    request: RegenerateSingleRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Regenerate embedding for a single person"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    face_service = FaceRecognitionService(db)
    embedding_service = EmbeddingGenerationService(db, face_service)
    
    result = await embedding_service.regenerate_single_embedding(
        school_id,
        request.person_type,
        request.person_id
    )
    
    return result


# ============ People Lists ============

@router.get("/students")
async def get_students_for_face(
    class_id: Optional[str] = None,
    status_filter: Optional[str] = None,  # "all" | "ready" | "pending" | "failed"
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get students with face registration status"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    query = {"school_id": school_id, "status": "active"}
    
    if class_id:
        query["class_id"] = class_id
    
    if status_filter == "ready":
        query["embedding_status"] = "generated"
    elif status_filter == "pending":
        query["$or"] = [
            {"embedding_status": "pending"},
            {"embedding_status": None}
        ]
    elif status_filter == "failed":
        query["embedding_status"] = "failed"
    
    cursor = db.students.find(query).sort("full_name", 1)
    
    students = []
    for student in cursor:
        students.append({
            "id": str(student["_id"]),
            "student_id": student.get("student_id"),
            "full_name": student.get("full_name"),
            "class_id": student.get("class_id"),
            "section": student.get("section"),
            "roll_number": student.get("roll_number"),
            "profile_image_url": student.get("profile_image_url"),
            "embedding_status": student.get("embedding_status", "pending"),
            "embedding_generated_at": student.get("embedding_generated_at"),
            "has_image": student.get("profile_image_url") is not None
        })
    
    return {"students": students}


@router.get("/employees")
async def get_employees_for_face(
    status_filter: Optional[str] = None,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get employees with face registration status"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    query = {"school_id": school_id}
    
    if status_filter == "ready":
        query["embedding_status"] = "generated"
    elif status_filter == "pending":
        query["$or"] = [
            {"embedding_status": "pending"},
            {"embedding_status": None}
        ]
    elif status_filter == "failed":
        query["embedding_status"] = "failed"
    
    cursor = db.teachers.find(query).sort("name", 1)
    
    employees = []
    for teacher in cursor:
        employees.append({
            "id": str(teacher["_id"]),
            "teacher_id": teacher.get("teacher_id"),
            "name": teacher.get("name"),
            "email": teacher.get("email"),
            "phone": teacher.get("phone"),
            "profile_image_url": teacher.get("profile_image_url"),
            "embedding_status": teacher.get("embedding_status", "pending"),
            "embedding_generated_at": teacher.get("embedding_generated_at"),
            "has_image": teacher.get("profile_image_url") is not None
        })
    
    return {"employees": employees}


# ============ Image Upload ============

@router.post("/upload-image/{person_type}/{person_id}")
async def upload_face_image(
    person_type: str,
    person_id: str,
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload face image and generate embedding.
    Uploads to Cloudinary, then generates embedding.
    """
    from ..services.cloudinary_service import CloudinaryService
    from bson import ObjectId
    from datetime import datetime
    
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    collection = db.students if person_type == "student" else db.teachers
    
    # Verify record exists
    record = await collection.find_one({"_id": ObjectId(person_id), "school_id": school_id})
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Read file
    file_content = await file.read()
    identifier = record.get("student_id") if person_type == "student" else record.get("teacher_id")
    
    logger.info(f"[FACE] Uploading image for {person_type}: {identifier}")
    
    # Upload to Cloudinary
    cloudinary_service = CloudinaryService()
    folder = f"school_{school_id}/{person_type}s"
    
    try:
        upload_result = await cloudinary_service.upload_image(
            file_content,
            folder=folder,
            public_id=f"{person_type}_{person_id}"
        )
    except Exception as e:
        logger.error(f"[FACE][ERROR] Cloudinary upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
    
    # Delete old image if exists
    old_public_id = record.get("profile_image_public_id")
    if old_public_id:
        try:
            await cloudinary_service.delete_image(old_public_id)
        except Exception:
            pass
    
    # Update record with new image URL
    await collection.update_one(
        {"_id": ObjectId(person_id)},
        {
            "$set": {
                "profile_image_url": upload_result.get("secure_url"),
                "profile_image_public_id": upload_result.get("public_id"),
                "image_uploaded_at": datetime.utcnow(),
                "face_image_updated_at": datetime.utcnow(),
                "embedding_status": "pending",
                "face_embedding": None
            }
        }
    )
    
    # Generate new embedding
    face_service = FaceRecognitionService(db)
    embedding, error = await face_service.generate_embedding_from_url(upload_result.get("secure_url"))
    
    if embedding:
        await collection.update_one(
            {"_id": ObjectId(person_id)},
            {
                "$set": {
                    "face_embedding": embedding,
                    "embedding_status": "generated",
                    "embedding_generated_at": datetime.utcnow(),
                    "embedding_model": "facenet",
                    "embedding_version": "facenet_v1"
                }
            }
        )
        logger.info(f"[FACE][SUCCESS] Image and embedding updated for {person_type}: {identifier}")
        
        # Update cache
        import numpy as np
        cache_data = {
            "embedding": np.array(embedding, dtype=np.float32),
            "name": record.get("full_name") if person_type == "student" else record.get("name"),
            "profile_image_url": upload_result.get("secure_url"),
            "school_id": school_id
        }
        if person_type == "student":
            cache_data.update({
                "student_id": identifier,
                "class_id": record.get("class_id"),
                "section": record.get("section"),
                "roll_number": record.get("roll_number")
            })
        else:
            cache_data.update({
                "teacher_id": identifier,
                "email": record.get("email")
            })
        
        face_service.refresh_cache_entry(person_type, person_id, cache_data)
        
        return {
            "success": True,
            "image_url": upload_result.get("secure_url"),
            "embedding_status": "generated"
        }
    else:
        logger.error(f"[FACE][ERROR] Embedding generation failed: {error}")
        return {
            "success": True,
            "image_url": upload_result.get("secure_url"),
            "embedding_status": "failed",
            "embedding_error": error
        }


# ============ Settings ============

@router.get("/settings")
async def get_face_settings(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get face recognition settings"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    settings_service = FaceSettingsService(db)
    settings = await settings_service.get_settings(school_id)
    
    return settings


@router.put("/settings")
async def update_face_settings(
    updates: SettingsUpdate,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update face recognition settings"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    settings_service = FaceSettingsService(db)
    
    # Filter out None values
    update_dict = {k: v for k, v in updates.dict().items() if v is not None}
    
    if update_dict:
        settings = await settings_service.update_settings(school_id, update_dict)
        logger.info(f"[FACE] Settings updated for school {school_id}")
        return settings
    
    return await settings_service.get_settings(school_id)


# ============ Classes List ============

@router.get("/classes")
async def get_classes_for_face(
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get classes with face registration summary"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    # Get all classes
    classes_cursor = db.classes.find({"school_id": school_id})
    classes = []
    for cls in classes_cursor:
        classes.append({
            "id": str(cls["_id"]),
            "class_name": cls.get("class_name") or cls.get("name"),
            "section": cls.get("section", "A")
        })
    
    # Get stats per class
    face_service = FaceRecognitionService(db)
    stats = await face_service.get_dashboard_stats(school_id)
    
    # Merge stats with classes
    stats_map = {}
    for stat in stats.get("classes", []):
        key = f"{stat['class_id']}_{stat['section']}"
        stats_map[key] = stat
    
    result = []
    for cls in classes:
        key = f"{cls['id']}_{cls['section']}"
        stat = stats_map.get(key, {"total": 0, "face_ready": 0, "pending": 0})
        result.append({
            **cls,
            "total_students": stat.get("total", 0),
            "face_ready": stat.get("face_ready", 0),
            "pending": stat.get("pending", 0)
        })
    
    return {"classes": result}
