"""Cloudinary image management service"""
import cloudinary
import cloudinary.uploader
import cloudinary.api
from app.config import settings
import requests
from typing import Optional, Tuple
import io
from PIL import Image
import logging

logger = logging.getLogger(__name__)

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret
)


class CloudinaryService:
    """Service for managing student images in Cloudinary"""
    
    @staticmethod
    def upload_image(
        file_content: bytes,
        file_name: str,
        student_id: str,
        school_id: str = None
    ) -> Optional[dict]:
        """
        Upload student image to Cloudinary
        
        Args:
            file_content: Image file bytes
            file_name: Original filename
            student_id: Student ID for organizing folder structure
            school_id: School ID for folder isolation
            
        Returns:
            Dict with secure_url and public_id or None if failed
        """
        try:
            # warn if Cloudinary settings appear missing
            if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
                logger.warning('🔴 [UPLOAD] Cloudinary credentials missing or incomplete')
                return None

            # Use structured folder: schools/{schoolId}/students/{studentId}
            if school_id:
                folder_path = f"schools/{school_id}/students/{student_id}"
            else:
                folder_path = f"{settings.school_name}/students/{student_id}"

            logger.info(f"🔵 [UPLOAD] Uploading image: {file_name} to {folder_path}")

            result = cloudinary.uploader.upload(
                file_content,
                folder=folder_path,
                resource_type="auto",
                use_filename=True,
                unique_filename=False,
                overwrite=True
            )

            logger.info(f"🟢 [UPLOAD] Success: {file_name} -> public_id={result.get('public_id')}")

            return {
                "secure_url": result.get("secure_url"),
                "public_id": result.get("public_id")
            }
        except Exception as e:
            logger.error(f"🔴 [UPLOAD] Failed: {file_name} - {str(e)}")
            # Return error details so callers can provide actionable messages
            return {"error": str(e)}
    
    @staticmethod
    def delete_image(public_id: str) -> bool:
        """
        Delete image from Cloudinary
        
        Args:
            public_id: Cloudinary public_id of image
            
        Returns:
            True if successful, False otherwise
        """
        try:
            cloudinary.uploader.destroy(public_id)
            return True
        except Exception as e:
            logger.error(f"Cloudinary delete failed for {public_id}: {str(e)}")
            return False
    
    @staticmethod
    def download_image(url: str) -> Optional[bytes]:
        """
        Download image from Cloudinary URL
        
        Args:
            url: Cloudinary secure URL
            
        Returns:
            Image bytes or None if failed
        """
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                return response.content
            return None
        except Exception as e:
            logger.error(f"Failed to download image from {url}: {str(e)}")
            return None
    
    @staticmethod
    def get_image_pil(url: str) -> Optional[Image.Image]:
        """
        Get PIL Image from Cloudinary URL
        
        Args:
            url: Cloudinary secure URL
            
        Returns:
            PIL Image object or None if failed
        """
        try:
            image_bytes = CloudinaryService.download_image(url)
            if image_bytes:
                return Image.open(io.BytesIO(image_bytes))
            return None
        except Exception as e:
            logger.error(f"Failed to process image from {url}: {str(e)}")
            return None
