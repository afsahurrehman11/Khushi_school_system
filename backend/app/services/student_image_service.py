"""Student image management service"""
import logging
from typing import Optional, Dict
from datetime import datetime
from bson import ObjectId
import base64
from io import BytesIO
from PIL import Image

from app.services.cloudinary_service import CloudinaryService
from app.database import get_db

logger = logging.getLogger(__name__)


class StudentImageService:
    """Service for managing student images and embeddings"""
    
    @staticmethod
    async def upload_student_image(
        student_id: str,
        file_content: bytes,
        file_name: str,
        school_id: str = None
    ) -> Dict[str, any]:
        """
        Upload image for a student
        
        Args:
            student_id: MongoDB ObjectId as string
            file_content: Image file bytes
            file_name: Original filename
            school_id: School ID for folder isolation
            
        Returns:
            Dict with success status and image details
        """
        try:
            logger.info(f"🔵 [UPLOAD] Processing image for student: {student_id}")
            
            # Validate image
            try:
                image = Image.open(BytesIO(file_content))
                image.verify()
                image = Image.open(BytesIO(file_content))  # Reopen after verify
            except Exception as e:
                logger.error(f"🔴 [UPLOAD] Invalid image file for student {student_id}: {str(e)}")
                return {
                    "success": False,
                    "error": f"Invalid image file: {str(e)}"
                }
            
            # Get student's school_id if not provided
            db = get_db()
            student_collection = db["students"]
            
            if not school_id:
                student = student_collection.find_one({"_id": ObjectId(student_id)})
                if student:
                    school_id = student.get("school_id")
            
            # Upload to Cloudinary
            cloudinary_result = CloudinaryService.upload_image(
                file_content,
                file_name,
                student_id,
                school_id
            )

            # CloudinaryService returns either a result dict or an error dict {"error": msg}
            if not cloudinary_result:
                logger.error(f"🔴 [UPLOAD] Cloudinary returned no result for student {student_id}")
                return {
                    "success": False,
                    "error": "Failed to upload image to cloud storage"
                }

            if isinstance(cloudinary_result, dict) and cloudinary_result.get("error"):
                err_msg = cloudinary_result.get("error")
                logger.error(f"🔴 [UPLOAD] Cloudinary error for student {student_id}: {err_msg}")
                return {
                    "success": False,
                    "error": f"Cloud storage error: {err_msg}"
                }

            logger.info(f"🟢 [UPLOAD] Cloudinary success for student {student_id}")
            
            # Update student document
            result = student_collection.update_one(
                {"_id": ObjectId(student_id)},
                {
                    "$set": {
                        "profile_image_url": cloudinary_result["secure_url"],
                        "profile_image_public_id": cloudinary_result["public_id"],
                        "image_uploaded_at": datetime.utcnow(),
                        "embedding_status": "pending",
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            logger.info(f"Student DB update result for {student_id}: matched={getattr(result, 'matched_count', None)}, modified={getattr(result, 'modified_count', None)}")

            if result.modified_count == 0:
                # Try to delete uploaded image if student update failed
                logger.warning(f"No student document updated for {student_id} after Cloudinary upload; rolling back cloud image {cloudinary_result.get('public_id')}")
                CloudinaryService.delete_image(cloudinary_result["public_id"])
                return {
                    "success": False,
                    "error": "Student not found"
                }
            
            return {
                "success": True,
                "image_url": cloudinary_result["secure_url"],
                "public_id": cloudinary_result["public_id"],
                "message": "Image uploaded successfully. Face embedding pending generation."
            }
            
        except Exception as e:
            logger.error(f"Error uploading image for student {student_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Upload failed: {str(e)}"
            }
    
    @staticmethod
    async def delete_student_image(student_id: str) -> Dict[str, any]:
        """
        Delete image for a student
        
        Args:
            student_id: MongoDB ObjectId as string
            
        Returns:
            Dict with success status
        """
        try:
            db = get_db()
            student_collection = db["students"]
            
            # Get student to find public_id
            student = student_collection.find_one({"_id": ObjectId(student_id)})
            
            if not student:
                return {"success": False, "error": "Student not found"}
            
            public_id = student.get("profile_image_public_id")
            
            # Delete from Cloudinary
            if public_id:
                CloudinaryService.delete_image(public_id)
            
            # Update student document
            result = student_collection.update_one(
                {"_id": ObjectId(student_id)},
                {
                    "$set": {
                        "profile_image_url": None,
                        "profile_image_public_id": None,
                        "image_uploaded_at": None,
                        "embedding_status": None,
                        "face_embedding": None,
                        "embedding_model": None,
                        "embedding_generated_at": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            return {"success": True, "message": "Image deleted successfully"}
            
        except Exception as e:
            logger.error(f"Error deleting image for student {student_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Delete failed: {str(e)}"
            }
    
    @staticmethod
    async def get_students_missing_photos(class_id: Optional[str] = None) -> Dict[str, any]:
        """
        Get students missing profile photos
        
        Args:
            class_id: Optional class filter
            
        Returns:
            Dict with per-class missing photo statistics
        """
        try:
            db = get_db()
            student_collection = db["students"]
            
            # Build match filter
            match_filter = {"profile_image_url": {"$exists": False}}
            if class_id:
                match_filter["class_id"] = class_id
            
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
            
            missing_by_class = list(student_collection.aggregate(pipeline))
            
            # Get total counts per class
            total_by_class_pipeline = [
                {
                    "$group": {
                        "_id": "$class_id",
                        "total_count": {"$sum": 1}
                    }
                }
            ]
            
            total_by_class = list(student_collection.aggregate(total_by_class_pipeline))
            total_dict = {item["_id"]: item["total_count"] for item in total_by_class}
            
            # Combine results
            result = []
            for missing_item in missing_by_class:
                class_id_val = missing_item["_id"]
                result.append({
                    "class_id": class_id_val,
                    "missing_count": missing_item["missing_count"],
                    "total_count": total_dict.get(class_id_val, 0),
                    "percentage_missing": round(
                        (missing_item["missing_count"] / total_dict.get(class_id_val, 1)) * 100, 2
                    )
                })
            
            return {
                "success": True,
                "data": result
            }
            
        except Exception as e:
            logger.error(f"Error fetching missing photos: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    async def get_class_students_missing_photos(class_id: str) -> Dict[str, any]:
        """
        Get list of students in specific class missing photos
        
        Args:
            class_id: Class ID
            
        Returns:
            Dict with student list
        """
        try:
            db = get_db()
            student_collection = db["students"]
            
            students = list(student_collection.find({
                "class_id": class_id,
                "profile_image_url": {"$exists": False}
            }))
            
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
            return {
                "success": False,
                "error": str(e)
            }
