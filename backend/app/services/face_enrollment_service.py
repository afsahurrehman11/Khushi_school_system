"""
Face Enrollment Service - Integration with external face-recognition-app

This service handles automatic enrollment of students/teachers to the external
face-recognition-app when they upload profile images.
"""
import logging
import requests
import io
from typing import Optional, Dict, Any, Tuple
from PIL import Image
import base64

from app.config import settings
from app.services.image_service import ImageService
from app.services.embedding_service import EmbeddingGenerator, FaceDetectionError

logger = logging.getLogger(__name__)


class FaceEnrollmentService:
    """Service for enrolling persons in the external face recognition system"""
    
    @staticmethod
    def is_enabled() -> bool:
        """Check if face recognition integration is enabled"""
        return settings.face_recognition_enabled
    
    @staticmethod
    async def enroll_person(
        person_id: str,
        name: str,
        role: str,
        image_blob: str,
        image_type: str,
        school_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enroll a person (student/teacher) in the external face recognition app
        
        Args:
            person_id: Student ID or Teacher ID
            name: Full name of the person
            role: 'student' or 'teacher'
            image_blob: Base64 encoded image
            image_type: MIME type (e.g., 'image/jpeg')
            school_id: School ID for multi-tenant uniqueness (CRITICAL)
            
        Returns:
            Dict with success status and details
            
        SECURITY NOTE:
        school_id is REQUIRED to prevent person ID collisions between schools.
        If not provided, attempts to get from middleware context.
        """
        if not FaceEnrollmentService.is_enabled():
            logger.info(f"[FACE] Face recognition disabled, skipping enrollment for {person_id}")
            return {
                "success": False,
                "skipped": True,
                "message": "Face recognition integration is disabled"
            }
        
        try:
            # SECURITY: Get school_id from middleware context if not provided
            if not school_id:
                from app.middleware.database_routing import get_current_school_id
                school_id = get_current_school_id()
            
            # CRITICAL: Prefix person_id with school_id to prevent collisions
            # Multiple schools can have student "S2024001" - must be unique in shared face app
            unique_person_id = f"{school_id}_{person_id}" if school_id else person_id
            
            if not school_id:
                logger.warning(f"⚠️ [FACE] No school_id for {person_id} - collision risk exists!")
            
            logger.info(f"[FACE] Enrolling {role} {person_id} ({name}) as {unique_person_id} to face recognition app")
            
            # Convert base64 blob to bytes
            image_bytes = base64.b64decode(image_blob)
            
            # Prepare multipart form data
            url = f"{settings.face_recognition_url}/enroll"
            
            # Create file-like object
            files = {
                'file': (f'{unique_person_id}.jpg', io.BytesIO(image_bytes), 'image/jpeg')
            }
            
            data = {
                'student_id': unique_person_id,  # Use prefixed ID
                'name': name,
                'role': role
            }
            
            headers = {}
            if settings.face_recognition_api_key:
                headers['x-api-key'] = settings.face_recognition_api_key
            
            # Call external API with timeout
            response = requests.post(
                url,
                files=files,
                data=data,
                headers=headers,
                timeout=10  # 10 second timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"✅ [FACE] Successfully enrolled {person_id} to face recognition app")
                return {
                    "success": True,
                    "message": "Enrolled to face recognition system",
                    "details": result
                }
            elif response.status_code == 400:
                error_msg = response.json().get('error', 'Unknown error')
                if 'already exists' in error_msg.lower():
                    logger.warning(f"⚠️ [FACE] {unique_person_id} already enrolled in face recognition app")
                    # Try to update instead
                    return await FaceEnrollmentService._update_person(
                        unique_person_id, name, role, image_bytes
                    )
                else:
                    logger.error(f"🔴 [FACE] Enrollment failed for {person_id}: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg
                    }
            else:
                logger.error(f"🔴 [FACE] Enrollment failed for {person_id}: HTTP {response.status_code}")
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text}"
                }
                
        except requests.Timeout:
            logger.warning(f"⚠️ [FACE-EXT] External enrollment timeout for {person_id} (non-critical)")
            return {
                "success": False,
                "skipped_external": True,
                "error": "External face recognition service timeout (optional feature)"
            }
        except requests.ConnectionError:
            logger.warning(f"⚠️ [FACE-EXT] External face service unavailable (non-critical) - embeddings will still be generated locally")
            return {
                "success": False,
                "skipped_external": True,
                "error": "External face service unavailable (optional)"
            }
        except Exception as e:
            logger.error(f"🔴 [FACE-EXT] Enrollment error for {person_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    async def _update_person(
        person_id: str,
        name: str,
        role: str,
        image_bytes: bytes
    ) -> Dict[str, Any]:
        """Update existing person in face recognition app"""
        try:
            url = f"{settings.face_recognition_url}/persons/{person_id}"
            
            files = {
                'file': (f'{person_id}.jpg', io.BytesIO(image_bytes), 'image/jpeg')
            }
            
            data = {
                'name': name,
                'role': role
            }
            
            headers = {}
            if settings.face_recognition_api_key:
                headers['x-api-key'] = settings.face_recognition_api_key
            
            response = requests.put(
                url,
                files=files,
                data=data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"✅ [FACE] Updated {person_id} in face recognition app")
                return {
                    "success": True,
                    "message": "Updated in face recognition system",
                    "updated": True
                }
            else:
                logger.error(f"🔴 [FACE] Update failed for {person_id}: HTTP {response.status_code}")
                return {
                    "success": False,
                    "error": f"Update failed: HTTP {response.status_code}"
                }
                
        except Exception as e:
            logger.error(f"🔴 [FACE] Update error for {person_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    async def generate_embedding_for_person(
        image_blob: str,
        person_id: str,
        person_type: str
    ) -> Tuple[Optional[list], str]:
        """
        Generate face embedding from image blob
        
        Args:
            image_blob: Base64 encoded image
            person_id: Student/Teacher ID (for logging)
            person_type: 'student' or 'teacher'
            
        Returns:
            Tuple of (embedding_vector, status)
            status can be: 'generated', 'no_face', 'failed'
        """
        try:
            logger.info(f"[EMBEDDING] Generating embedding for {person_type} {person_id}")
            
            # Convert base64 to PIL Image
            pil_image = ImageService.get_pil_image_from_base64(image_blob)
            if not pil_image:
                logger.error(f"🔴 [EMBEDDING] Failed to load image for {person_id}")
                return None, "failed"
            
            # Generate embedding
            embedding, status = EmbeddingGenerator.generate_embedding_from_image(pil_image)
            
            if status == "generated" and embedding:
                logger.info(f"✅ [EMBEDDING] Generated embedding for {person_id}")
                return embedding, "generated"
            elif status == "no_face":
                logger.warning(f"⚠️ [EMBEDDING] No face detected for {person_id}")
                return None, "no_face"
            else:
                logger.error(f"🔴 [EMBEDDING] Embedding generation failed for {person_id}")
                return None, "failed"
                
        except FaceDetectionError as e:
            logger.warning(f"⚠️ [EMBEDDING] No face detected for {person_id}: {str(e)}")
            return None, "no_face"
        except Exception as e:
            logger.error(f"🔴 [EMBEDDING] Embedding error for {person_id}: {str(e)}")
            return None, "failed"
    
    @staticmethod
    async def delete_person(person_id: str, school_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Delete a person from the external face recognition app
        
        Args:
            person_id: Student ID or Teacher ID
            school_id: School ID for multi-tenant uniqueness
            
        Returns:
            Dict with success status
        """
        if not FaceEnrollmentService.is_enabled():
            return {
                "success": False,
                "skipped": True,
                "message": "Face recognition integration is disabled"
            }
        
        try:
            # Get school_id from context if not provided
            if not school_id:
                from app.middleware.database_routing import get_current_school_id
                school_id = get_current_school_id()
            
            # Use prefixed ID for deletion (same as enrollment)
            unique_person_id = f"{school_id}_{person_id}" if school_id else person_id
            
            logger.info(f"[FACE] Deleting {person_id} (unique: {unique_person_id}) from face recognition app")
            
            url = f"{settings.face_recognition_url}/persons/{unique_person_id}"
            
            headers = {}
            if settings.face_recognition_api_key:
                headers['x-api-key'] = settings.face_recognition_api_key
            
            response = requests.delete(
                url,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"✅ [FACE] Deleted {person_id} from face recognition app")
                return {
                    "success": True,
                    "message": "Deleted from face recognition system"
                }
            elif response.status_code == 404:
                logger.warning(f"⚠️ [FACE] {person_id} not found in face recognition app")
                return {
                    "success": True,
                    "message": "Person not found (already deleted)"
                }
            else:
                logger.error(f"🔴 [FACE] Delete failed for {person_id}: HTTP {response.status_code}")
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}"
                }
                
        except Exception as e:
            logger.error(f"🔴 [FACE] Delete error for {person_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
