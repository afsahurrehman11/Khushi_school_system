"""Student image management service - MongoDB Blob Storage"""
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
from app.database import get_db

logger = logging.getLogger(__name__)


class StudentImageService:
    """Service for managing student images stored as blobs in MongoDB"""
    
    @staticmethod
    async def upload_student_image(
        student_id: str,
        file_content: bytes,
        file_name: str,
        school_id: str = None
    ) -> Dict[str, Any]:
        """
        Upload image for a student - stores as base64 blob in MongoDB
        
        Args:
            student_id: MongoDB ObjectId as string
            file_content: Image file bytes
            file_name: Original filename
            school_id: School ID for validation
            
        Returns:
            Dict with success status and image details
        """
        try:
            logger.info(f"🔵 [UPLOAD] Processing image for student: {student_id}")
            
            # Process and convert to base64 blob
            image_blob, image_type, error = ImageService.process_and_store(
                file_content,
                max_dimension=800,
                quality=85
            )
            
            if error:
                logger.error(f"🔴 [UPLOAD] Image processing failed for student {student_id}: {error}")
                return {
                    "success": False,
                    "error": error
                }
            
            # Update student document with blob
            db = get_db()
            student_collection = db["students"]
            
            # Build query
            query = {"_id": ObjectId(student_id)}
            if school_id:
                query["school_id"] = school_id
            
            result = student_collection.update_one(
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
                logger.warning(f"No student document updated for {student_id}")
                return {
                    "success": False,
                    "error": "Student not found"
                }
            
            logger.info(f"🟢 [UPLOAD] Image stored for student {student_id}")
            
            # === AUTO-ENROLLMENT: Face Recognition App & Embedding Generation ===
            # Start both processes in parallel for efficiency
            enrollment_task = None
            embedding_task = None
            
            # Get student details for enrollment
            student = student_collection.find_one(
                query,
                {"full_name": 1, "student_id": 1}
            )
            
            if student:
                student_name = student.get("full_name", "Unknown Student")
                student_reg_id = student.get("student_id", student_id)
                
                # 1. Enroll in external face recognition app (OPTIONAL, non-blocking)
                # This is for the standalone face-recognition-app which may not be running
                try:
                    enrollment_result = await FaceEnrollmentService.enroll_person(
                        person_id=student_reg_id,
                        name=student_name,
                        role='student',
                        image_blob=image_blob,
                        image_type=image_type,
                        school_id=school_id  # Pass school_id for unique ID
                    )
                    
                    if enrollment_result.get("success"):
                        logger.info(f"✅ [FACE-EXT] Student {student_id} enrolled in external face service")
                    elif enrollment_result.get("skipped_external"):
                        # External service not running - this is OK, local embedding still works
                        logger.debug(f"ℹ️ [FACE-EXT] External service skipped for {student_id} (not running)")
                    else:
                        logger.warning(f"⚠️ [FACE-EXT] External enrollment warning: {enrollment_result.get('error', 'Unknown')}")
                except Exception as e:
                    logger.debug(f"ℹ️ [FACE-EXT] External enrollment skipped: {str(e)}")
                
                # 2. Generate embedding for main database (PRIMARY - this is what matters)
                try:
                    embedding, emb_status = await FaceEnrollmentService.generate_embedding_for_person(
                        image_blob=image_blob,
                        person_id=student_reg_id,
                        person_type='student'
                    )
                    
                    if emb_status == "generated" and embedding:
                        # Update student with embedding
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "face_embedding": embedding,
                                    "embedding_model": "VGGFace",
                                    "embedding_generated_at": datetime.utcnow(),
                                    "embedding_status": "generated",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        logger.info(f"✅ [EMBEDDING] Generated and stored embedding for {student_id}")
                    else:
                        # Update status to reflect failure
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "embedding_status": emb_status,
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        logger.warning(f"⚠️ [EMBEDDING] Embedding generation {emb_status} for {student_id}")
                except Exception as e:
                    logger.error(f"🔴 [EMBEDDING] Exception for {student_id}: {str(e)}")
                    student_collection.update_one(
                        {"_id": ObjectId(student_id)},
                        {
                            "$set": {
                                "embedding_status": "failed",
                                "updated_at": datetime.utcnow()
                            }
                        }
                    )
            
            return {
                "success": True,
                "image_type": image_type,
                "message": "Image uploaded successfully. Face registration initiated."
            }
            
        except Exception as e:
            logger.error(f"Error uploading image for student {student_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Upload failed: {str(e)}"
            }
    
    @staticmethod
    async def upload_cnic_image(
        student_id: str,
        file_content: bytes,
        school_id: str = None
    ) -> Dict[str, Any]:
        """Upload CNIC image for a student (optional)"""
        try:
            # Process CNIC image with higher quality for readability
            image_blob, image_type, error = ImageService.process_and_store(
                file_content,
                max_dimension=1200,
                quality=90
            )
            
            if error:
                return {"success": False, "error": error}
            
            db = get_db()
            query = {"_id": ObjectId(student_id)}
            if school_id:
                query["school_id"] = school_id
            
            result = db.students.update_one(
                query,
                {
                    "$set": {
                        "cnic_image_blob": image_blob,
                        "cnic_image_type": image_type,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            if result.modified_count == 0:
                return {"success": False, "error": "Student not found"}
            
            return {"success": True, "message": "CNIC image uploaded"}
            
        except Exception as e:
            logger.error(f"Error uploading CNIC for student {student_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def delete_student_image(student_id: str, school_id: str = None) -> Dict[str, Any]:
        """Delete profile image for a student"""
        try:
            db = get_db()
            query = {"_id": ObjectId(student_id)}
            if school_id:
                query["school_id"] = school_id
            
            # Get student ID for face recognition app deletion
            student = db.students.find_one(query, {"student_id": 1})
            student_reg_id = student.get("student_id") if student else None
            
            result = db.students.update_one(
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
                return {"success": False, "error": "Student not found"}
            
            # Delete from face recognition app (non-blocking, best effort)
            if student_reg_id:
                try:
                    await FaceEnrollmentService.delete_person(student_reg_id, school_id=school_id)
                    logger.info(f"✅ [FACE] Deleted student {student_reg_id} from face recognition app")
                except Exception as e:
                    logger.warning(f"⚠️ [FACE] Failed to delete {student_reg_id} from face app: {str(e)}")
            
            return {"success": True, "message": "Image deleted successfully"}
            
        except Exception as e:
            logger.error(f"Error deleting image for student {student_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def get_profile_image_data_url(student_id: str, school_id: str = None) -> Optional[str]:
        """Get student profile image as data URL for display"""
        try:
            db = get_db()
            query = {"_id": ObjectId(student_id)}
            if school_id:
                query["school_id"] = school_id
            
            student = db.students.find_one(
                query,
                {"profile_image_blob": 1, "profile_image_type": 1}
            )
            
            if student and student.get("profile_image_blob"):
                mime_type = student.get("profile_image_type", "image/jpeg")
                return f"data:{mime_type};base64,{student['profile_image_blob']}"
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting image for student {student_id}: {str(e)}")
            return None
    
    @staticmethod
    def get_profile_image_bytes(student_id: str, school_id: str = None) -> Optional[bytes]:
        """Get student profile image as bytes for embedding generation"""
        try:
            db = get_db()
            query = {"_id": ObjectId(student_id)}
            if school_id:
                query["school_id"] = school_id
            
            student = db.students.find_one(query, {"profile_image_blob": 1})
            
            if student and student.get("profile_image_blob"):
                return base64.b64decode(student["profile_image_blob"])
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting image bytes for student {student_id}: {str(e)}")
            return None
    
    @staticmethod
    async def get_students_missing_photos(class_id: Optional[str] = None, school_id: str = None) -> Dict[str, Any]:
        """Get statistics of students missing profile photos"""
        try:
            db = get_db()
            
            # Build match filter for missing photos
            match_filter = {
                "$or": [
                    {"profile_image_blob": {"$exists": False}},
                    {"profile_image_blob": None}
                ]
            }
            if class_id:
                match_filter["class_id"] = class_id
            if school_id:
                match_filter["school_id"] = school_id
            
            # Aggregate by class
            pipeline = [
                {"$match": match_filter},
                {
                    "$group": {
                        "_id": "$class_id",
                        "missing_count": {"$sum": 1}
                    }
                },
                {"$sort": {"_id": 1}}
            ]
            
            missing_by_class = list(db.students.aggregate(pipeline))
            
            # Get total counts per class
            total_filter = {}
            if school_id:
                total_filter["school_id"] = school_id
            
            total_pipeline = [
                {"$match": total_filter},
                {
                    "$group": {
                        "_id": "$class_id",
                        "total_count": {"$sum": 1}
                    }
                }
            ]
            
            total_by_class = list(db.students.aggregate(total_pipeline))
            total_dict = {item["_id"]: item["total_count"] for item in total_by_class}
            
            # Combine results
            result = []
            for missing_item in missing_by_class:
                class_id_val = missing_item["_id"]
                total = total_dict.get(class_id_val, 0)
                result.append({
                    "class_id": class_id_val,
                    "missing_count": missing_item["missing_count"],
                    "total_count": total,
                    "percentage_missing": round(
                        (missing_item["missing_count"] / max(total, 1)) * 100, 2
                    )
                })
            
            return {"success": True, "data": result}
            
        except Exception as e:
            logger.error(f"Error fetching missing photos: {str(e)}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def get_class_students_missing_photos(class_id: str, school_id: str = None) -> Dict[str, Any]:
        """Get list of students in specific class missing photos"""
        try:
            db = get_db()
            
            query = {
                "class_id": class_id,
                "$or": [
                    {"profile_image_blob": {"$exists": False}},
                    {"profile_image_blob": None}
                ]
            }
            if school_id:
                query["school_id"] = school_id
            
            students = list(db.students.find(query))
            
            return {
                "success": True,
                "class_id": class_id,
                "students": [
                    {
                        "id": str(student.get("_id", "")),
                        "student_id": student.get("student_id"),
                        "full_name": student.get("full_name"),
                        "roll_number": student.get("roll_number")
                    }
                    for student in students
                ]
            }
            
        except Exception as e:
            logger.error(f"Error fetching students missing photos: {str(e)}")
            return {"success": False, "error": str(e)}
