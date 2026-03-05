"""Teacher image management service - MongoDB Blob Storage"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
import base64
from io import BytesIO
from PIL import Image
import asyncio

from app.services.image_service import ImageService
from app.services.face_enrollment_service import FaceEnrollmentService
from app.services.embedding_background_tasks import EmbeddingBackgroundTask
from app.database import get_db

logger = logging.getLogger(__name__)


class TeacherImageService:
    """Service for managing teacher images stored as blobs in MongoDB"""
    
    @staticmethod
    async def upload_teacher_image(
        teacher_id: str,
        file_content: bytes,
        file_name: str,
        school_id: str = None
    ) -> Dict[str, Any]:
        """
        Upload image for a teacher - stores as base64 blob in MongoDB
        
        Args:
            teacher_id: MongoDB ObjectId as string
            file_content: Image file bytes
            file_name: Original filename
            school_id: School ID for validation
            
        Returns:
            Dict with success status and image details
        """
        try:
            logger.info(f"🔵 [UPLOAD] Processing image for teacher: {teacher_id}")
            
            # Process and convert to base64 blob
            image_blob, image_type, error = ImageService.process_and_store(
                file_content,
                max_dimension=800,
                quality=85
            )
            
            if error:
                logger.error(f"🔴 [UPLOAD] Image processing failed for teacher {teacher_id}: {error}")
                return {
                    "success": False,
                    "error": error
                }
            
            # Update teacher document with blob
            db = get_db()
            teacher_collection = db["teachers"]
            
            # Build query
            query = {"_id": ObjectId(teacher_id)}
            if school_id:
                query["school_id"] = school_id
            
            result = teacher_collection.update_one(
                query,
                {
                    "$set": {
                        "profile_image_blob": image_blob,
                        "profile_image_type": image_type,
                        "image_uploaded_at": datetime.utcnow(),
                        "face_image_updated_at": datetime.utcnow(),
                        "embedding_status": "pending",
                        "face_embedding": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            if result.modified_count == 0:
                logger.warning(f"No teacher document updated for {teacher_id}")
                return {
                    "success": False,
                    "error": "Teacher not found"
                }
            
            logger.info(f"🟢 [UPLOAD] Image stored for teacher {teacher_id}")
            
            # === AUTO-ENROLLMENT: Start Background Embedding Generation ===
            # Get teacher details for logging
            teacher = teacher_collection.find_one(
                query,
                {"name": 1, "teacher_id": 1, "cnic": 1}
            )
            
            if teacher:
                teacher_name = teacher.get("name", "Unknown Teacher")
                teacher_reg_id = teacher.get("teacher_id") or teacher.get("cnic") or str(teacher_id)
                
                logger.info(f"🔄 [EMBEDDING] Scheduling background embedding generation for {teacher_name} ({teacher_reg_id})")
                
                # Trigger background embedding generation
                # This runs asynchronously and doesn't block the response
                asyncio.create_task(
                    EmbeddingBackgroundTask.generate_embedding_for_person(
                        person_id=teacher_id,
                        person_type='teacher',
                        school_id=school_id,
                        image_blob=image_blob
                    )
                )
                
                logger.info(f"✅ [EMBEDDING] Background task scheduled for {teacher_reg_id}")
            
            return {
                "success": True,
                "message": "Image uploaded successfully, embedding generation started in background"
            }
            
            
        except Exception as e:
            logger.error(f"Error uploading image for teacher {teacher_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Upload failed: {str(e)}"
            }
    
    @staticmethod
    async def delete_teacher_image(teacher_id: str, school_id: str = None) -> Dict[str, Any]:
        """Delete profile image for a teacher"""
        try:
            db = get_db()
            query = {"_id": ObjectId(teacher_id)}
            if school_id:
                query["school_id"] = school_id
            
            # Get teacher ID for face recognition app deletion
            teacher = db.teachers.find_one(query, {"teacher_id": 1, "cnic": 1})
            teacher_reg_id = None
            if teacher:
                teacher_reg_id = teacher.get("teacher_id") or teacher.get("cnic")
            
            result = db.teachers.update_one(
                query,
                {
                    "$set": {
                        "profile_image_blob": None,
                        "profile_image_type": None,
                        "image_uploaded_at": None,
                        "embedding_status": None,
                        "face_embedding": None,
                        "embedding_model": None,
                        "embedding_generated_at": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            if result.modified_count == 0:
                return {"success": False, "error": "Teacher not found"}
            
            # Delete from face recognition app (non-blocking, best effort)
            if teacher_reg_id:
                try:
                    await FaceEnrollmentService.delete_person(teacher_reg_id, school_id=school_id)
                    logger.info(f"✅ [FACE] Deleted teacher {teacher_reg_id} from face recognition app")
                except Exception as e:
                    logger.warning(f"⚠️ [FACE] Failed to delete teacher {teacher_reg_id} from face app: {str(e)}")
            
            return {"success": True, "message": "Image deleted successfully"}
            
        except Exception as e:
            logger.error(f"Error deleting image for teacher {teacher_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def get_profile_image_data_url(teacher_id: str, school_id: str = None) -> Optional[str]:
        """Get teacher profile image as data URL for display"""
        try:
            db = get_db()
            query = {"_id": ObjectId(teacher_id)}
            if school_id:
                query["school_id"] = school_id
            
            teacher = db.teachers.find_one(
                query,
                {"profile_image_blob": 1, "profile_image_type": 1}
            )
            
            if teacher and teacher.get("profile_image_blob"):
                mime_type = teacher.get("profile_image_type", "image/jpeg")
                return f"data:{mime_type};base64,{teacher['profile_image_blob']}"
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting image for teacher {teacher_id}: {str(e)}")
            return None
