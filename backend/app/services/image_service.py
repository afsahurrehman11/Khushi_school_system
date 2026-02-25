"""
Image Service - MongoDB Blob Storage
Handles image storage as base64 blobs directly in MongoDB documents.
Replaces Cloudinary for self-hosted image storage.
"""
import base64
import io
import logging
from typing import Optional, Tuple, Dict, Any
from PIL import Image

logger = logging.getLogger(__name__)


class ImageService:
    """Service for handling image storage as base64 blobs in MongoDB"""
    
    # Allowed image formats
    ALLOWED_FORMATS = {'jpeg', 'jpg', 'png', 'webp'}
    MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB max
    
    @staticmethod
    def validate_image(image_bytes: bytes) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Validate image bytes and return format info.
        Returns: (is_valid, mime_type, error_message)
        """
        try:
            if len(image_bytes) > ImageService.MAX_IMAGE_SIZE:
                return False, None, f"Image too large. Max size: {ImageService.MAX_IMAGE_SIZE // (1024*1024)}MB"
            
            # Open and validate with PIL
            img = Image.open(io.BytesIO(image_bytes))
            format_lower = img.format.lower() if img.format else None
            
            if not format_lower or format_lower not in ImageService.ALLOWED_FORMATS:
                return False, None, f"Invalid format: {format_lower}. Allowed: {ImageService.ALLOWED_FORMATS}"
            
            # Determine MIME type
            mime_map = {'jpeg': 'image/jpeg', 'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}
            mime_type = mime_map.get(format_lower, 'image/jpeg')
            
            return True, mime_type, None
            
        except Exception as e:
            logger.error(f"Image validation failed: {e}")
            return False, None, f"Invalid image file: {str(e)}"
    
    @staticmethod
    def encode_to_base64(image_bytes: bytes) -> str:
        """Encode image bytes to base64 string for storage"""
        return base64.b64encode(image_bytes).decode('utf-8')
    
    @staticmethod
    def decode_from_base64(base64_str: str) -> bytes:
        """Decode base64 string back to image bytes"""
        return base64.b64decode(base64_str)
    
    @staticmethod
    def process_and_store(
        image_bytes: bytes,
        max_dimension: int = 800,
        quality: int = 85
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Process image (resize if needed) and return base64 encoded string.
        Returns: (base64_blob, mime_type, error_message)
        """
        try:
            # Validate
            is_valid, mime_type, error = ImageService.validate_image(image_bytes)
            if not is_valid:
                return None, None, error
            
            # Open image
            img = Image.open(io.BytesIO(image_bytes))
            original_format = img.format
            
            # Convert RGBA to RGB if needed (for JPEG)
            if img.mode == 'RGBA' and original_format == 'JPEG':
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            
            # Resize if too large
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = tuple(int(dim * ratio) for dim in img.size)
                img = img.resize(new_size, Image.Resampling.LANCZOS)
                logger.info(f"Image resized from {img.size} to {new_size}")
            
            # Save to buffer
            buffer = io.BytesIO()
            save_format = 'JPEG' if original_format in ['JPEG', 'JPG'] else original_format
            
            if save_format == 'JPEG':
                img = img.convert('RGB')
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                mime_type = 'image/jpeg'
            elif save_format == 'PNG':
                img.save(buffer, format='PNG', optimize=True)
                mime_type = 'image/png'
            else:
                img.save(buffer, format=save_format, quality=quality)
            
            buffer.seek(0)
            processed_bytes = buffer.getvalue()
            
            # Encode to base64
            base64_blob = ImageService.encode_to_base64(processed_bytes)
            
            logger.info(f"Image processed: {len(processed_bytes)} bytes -> {len(base64_blob)} chars base64")
            return base64_blob, mime_type, None
            
        except Exception as e:
            logger.error(f"Image processing failed: {e}")
            return None, None, f"Image processing failed: {str(e)}"
    
    @staticmethod
    def get_image_data_url(base64_blob: str, mime_type: str) -> str:
        """Generate data URL for displaying image in browser"""
        return f"data:{mime_type};base64,{base64_blob}"    
    @staticmethod
    def get_pil_image_from_base64(base64_str: str) -> Optional[Image.Image]:
        """
        Convert base64 string to PIL Image object.
        Returns PIL Image or None if conversion fails.
        """
        try:
            image_bytes = ImageService.decode_from_base64(base64_str)
            return Image.open(io.BytesIO(image_bytes))
        except Exception as e:
            logger.error(f"Failed to convert base64 to PIL image: {e}")
            return None
    
    @staticmethod
    def extract_for_embedding(base64_str: str) -> Optional[bytes]:
        """
        Extract image bytes from base64 for embedding generation.
        This is a convenience method that just decodes the base64.
        """
        try:
            return ImageService.decode_from_base64(base64_str)
        except Exception as e:
            logger.error(f"Failed to extract image bytes for embedding: {e}")
            return None    
    @staticmethod
    def extract_for_embedding(base64_blob: str) -> Optional[bytes]:
        """Extract image bytes from base64 for face embedding generation"""
        try:
            return ImageService.decode_from_base64(base64_blob)
        except Exception as e:
            logger.error(f"Failed to extract image bytes: {e}")
            return None


class StudentImageService:
    """Service for managing student images stored as blobs in MongoDB"""
    
    def __init__(self, db):
        self.db = db
    
    async def upload_profile_image(
        self,
        student_id: str,
        school_id: str,
        image_bytes: bytes
    ) -> Dict[str, Any]:
        """
        Upload/update student profile image.
        Stores image as base64 blob in MongoDB student document.
        """
        from bson import ObjectId
        from datetime import datetime
        
        # Process image
        base64_blob, mime_type, error = ImageService.process_and_store(
            image_bytes,
            max_dimension=800,
            quality=85
        )
        
        if error:
            return {"success": False, "error": error}
        
        # Find student
        student = self.db.students.find_one({
            "_id": ObjectId(student_id),
            "school_id": school_id
        })
        
        if not student:
            return {"success": False, "error": "Student not found"}
        
        # Update student with new image blob
        now = datetime.utcnow()
        update_result = self.db.students.update_one(
            {"_id": ObjectId(student_id)},
            {
                "$set": {
                    "profile_image_blob": base64_blob,
                    "profile_image_type": mime_type,
                    "image_uploaded_at": now,
                    "face_image_updated_at": now,
                    "embedding_status": "pending",  # Mark for re-embedding
                    "face_embedding": None,
                    "updated_at": now
                }
            }
        )
        
        if update_result.modified_count > 0:
            logger.info(f"Profile image updated for student {student_id}")
            return {
                "success": True,
                "message": "Image uploaded successfully",
                "image_type": mime_type
            }
        
        return {"success": False, "error": "Failed to update student"}
    
    async def upload_cnic_image(
        self,
        student_id: str,
        school_id: str,
        image_bytes: bytes
    ) -> Dict[str, Any]:
        """Upload/update student CNIC image (optional)"""
        from bson import ObjectId
        from datetime import datetime
        
        # Process image
        base64_blob, mime_type, error = ImageService.process_and_store(
            image_bytes,
            max_dimension=1200,  # CNIC can be larger for readability
            quality=90
        )
        
        if error:
            return {"success": False, "error": error}
        
        # Update student
        now = datetime.utcnow()
        update_result = self.db.students.update_one(
            {"_id": ObjectId(student_id), "school_id": school_id},
            {
                "$set": {
                    "cnic_image_blob": base64_blob,
                    "cnic_image_type": mime_type,
                    "updated_at": now
                }
            }
        )
        
        if update_result.modified_count > 0:
            return {"success": True, "message": "CNIC image uploaded"}
        
        return {"success": False, "error": "Failed to update student or student not found"}
    
    def get_profile_image_bytes(self, student_id: str, school_id: str) -> Optional[bytes]:
        """Get student profile image as bytes (for embedding generation)"""
        from bson import ObjectId
        
        student = self.db.students.find_one(
            {"_id": ObjectId(student_id), "school_id": school_id},
            {"profile_image_blob": 1}
        )
        
        if student and student.get("profile_image_blob"):
            return ImageService.extract_for_embedding(student["profile_image_blob"])
        
        return None
    
    def get_profile_image_data_url(self, student_id: str, school_id: str) -> Optional[str]:
        """Get student profile image as data URL for display"""
        from bson import ObjectId
        
        student = self.db.students.find_one(
            {"_id": ObjectId(student_id), "school_id": school_id},
            {"profile_image_blob": 1, "profile_image_type": 1}
        )
        
        if student and student.get("profile_image_blob"):
            mime_type = student.get("profile_image_type", "image/jpeg")
            return ImageService.get_image_data_url(student["profile_image_blob"], mime_type)
        
        return None
