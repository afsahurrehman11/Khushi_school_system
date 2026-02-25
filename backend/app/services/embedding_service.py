"""Face embedding generation service"""
import numpy as np
import logging
from typing import Optional, Tuple
from PIL import Image
import io
import requests

logger = logging.getLogger(__name__)

# Try to import available face detection libraries
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    # Don't import DeepFace at module import time — it pulls heavy TensorFlow
    # dependencies (and retinaface which requires `tf-keras`). Lazy-load
    # DeepFace when actually needed to allow the app to start without TF.
    HAS_DEEPFACE = False
    _DEEPFACE = None
except ImportError:
    HAS_DEEPFACE = False

try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except ImportError:
    HAS_FACE_RECOGNITION = False


class FaceDetectionError(Exception):
    """Raised when face detection fails"""
    pass


class EmbeddingGenerator:
    """Service for generating face embeddings from student images"""
    
    # Model configuration
    EMBEDDING_MODEL = "VGGFace2"  # Using DeepFace VGGFace2 (4096 dimensions)
    EMBEDDING_DIMENSION = 4096
    
    @staticmethod
    def normalize_embedding(embedding: np.ndarray) -> list:
        """
        Normalize embedding vector to unit length (L2 normalization)
        
        Args:
            embedding: Numpy array of embedding values
            
        Returns:
            Normalized embedding as list
        """
        norm = np.linalg.norm(embedding)
        if norm > 0:
            normalized = embedding / norm
        else:
            normalized = embedding
        return normalized.tolist()
    
    @staticmethod
    def detect_and_crop_face(pil_image: Image.Image) -> Optional[Image.Image]:
        """
        Detect face in image and return cropped face
        
        Args:
            pil_image: PIL Image object
            
        Returns:
            Cropped face image or None if no face detected
        """
        try:
            # Convert PIL to numpy array
            image_array = np.array(pil_image)
            
            # Ensure 3-channel image
            if len(image_array.shape) == 2:  # Grayscale
                image_array = np.stack([image_array] * 3, axis=-1)
            elif image_array.shape[2] == 4:  # RGBA
                image_array = image_array[:, :, :3]
            
            # Try DeepFace if available (most reliable). Lazy-import DeepFace
            # only when needed to avoid importing TF at startup.
            if EmbeddingGenerator._ensure_deepface():
                return EmbeddingGenerator._detect_with_deepface(image_array)
            
            # Fall back to face_recognition
            if HAS_FACE_RECOGNITION:
                return EmbeddingGenerator._detect_with_face_recognition(image_array)
            
            # Fall back to OpenCV Haar Cascade
            if HAS_CV2:
                return EmbeddingGenerator._detect_with_opencv(image_array)
            
            raise FaceDetectionError("No face detection library available")
            
        except Exception as e:
            logger.error(f"Face detection error: {str(e)}")
            raise FaceDetectionError(f"Face detection failed: {str(e)}")
    
    @staticmethod
    def _detect_with_deepface(image_array: np.ndarray) -> Optional[Image.Image]:
        """Detect face using DeepFace"""
        try:
            # use the lazy-loaded DeepFace module
            results = _DEEPFACE.extract_faces(image_array, enforce_detection=True)
            if results and len(results) > 0:
                # Get the face region from the first detected face
                face_obj = results[0]
                facial_area = face_obj.get("facial_area", {})
                x = facial_area.get("x", 0)
                y = facial_area.get("y", 0)
                w = facial_area.get("w", image_array.shape[1])
                h = facial_area.get("h", image_array.shape[0])
                
                # Crop the face
                cropped = image_array[y:y+h, x:x+w]
                return Image.fromarray(cropped.astype("uint8"))
            return None
        except Exception as e:
            logger.warning(f"DeepFace detection failed: {str(e)}")
            return None

    @staticmethod
    def _ensure_deepface() -> bool:
        """Ensure DeepFace is imported and available at runtime.

        Returns True if DeepFace is available and loaded into `_DEEPFACE`.
        """
        global _DEEPFACE, HAS_DEEPFACE
        if _DEEPFACE is not None:
            return True
        try:
            from deepface import DeepFace as _DF
            _DEEPFACE = _DF
            HAS_DEEPFACE = True
            return True
        except Exception:
            HAS_DEEPFACE = False
            return False
    
    @staticmethod
    def _detect_with_face_recognition(image_array: np.ndarray) -> Optional[Image.Image]:
        """Detect face using face_recognition library"""
        try:
            face_locations = face_recognition.face_locations(image_array)
            if face_locations:
                # Get the first face location (top, right, bottom, left)
                top, right, bottom, left = face_locations[0]
                cropped = image_array[top:bottom, left:right]
                return Image.fromarray(cropped.astype("uint8"))
            return None
        except Exception as e:
            logger.warning(f"face_recognition detection failed: {str(e)}")
            return None
    
    @staticmethod
    def _detect_with_opencv(image_array: np.ndarray) -> Optional[Image.Image]:
        """Detect face using OpenCV Haar Cascade"""
        try:
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            
            if len(faces) > 0:
                x, y, w, h = faces[0]
                cropped = image_array[y:y+h, x:x+w]
                return Image.fromarray(cropped.astype("uint8"))
            return None
        except Exception as e:
            logger.warning(f"OpenCV detection failed: {str(e)}")
            return None
    
    @staticmethod
    def generate_embedding(cropped_face: Image.Image) -> Optional[list]:
        """
        Generate face embedding from cropped face image
        
        Args:
            cropped_face: PIL Image of cropped face
            
        Returns:
            Normalized embedding vector as list or None if failed
        """
        try:
            if not EmbeddingGenerator._ensure_deepface():
                logger.error("DeepFace not available for embedding generation")
                return None
            
            # Convert PIL to numpy
            face_array = np.array(cropped_face)
            
            # Ensure correct format
            if len(face_array.shape) == 2:
                face_array = np.stack([face_array] * 3, axis=-1)
            
            # Generate embedding using DeepFace
            embedding_objs = _DEEPFACE.represent(
                face_array,
                model_name="VGGFace2",
                enforce_detection=False
            )
            
            if embedding_objs:
                embedding = np.array(embedding_objs[0]["embedding"])
                # Normalize to L2 unit length
                normalized = EmbeddingGenerator.normalize_embedding(embedding)
                return normalized
            
            return None
            
        except Exception as e:
            logger.error(f"Embedding generation error: {str(e)}")
            return None
    
    @staticmethod
    def generate_embedding_from_image(pil_image: Image.Image) -> Tuple[Optional[list], Optional[str]]:
        """
        Complete pipeline: detect face, crop, and generate embedding
        
        Args:
            pil_image: PIL Image object
            
        Returns:
            Tuple of (embedding, status) where status is "generated" or "failed"
        """
        try:
            # Detect and crop face
            cropped_face = EmbeddingGenerator.detect_and_crop_face(pil_image)
            if cropped_face is None:
                logger.warning("No face detected in image")
                return None, "failed"
            
            # Generate embedding
            embedding = EmbeddingGenerator.generate_embedding(cropped_face)
            if embedding is None:
                logger.warning("Failed to generate embedding")
                return None, "failed"
            
            return embedding, "generated"
            
        except Exception as e:
            logger.error(f"Embedding generation pipeline error: {str(e)}")
            return None, "failed"
    
    @staticmethod
    def generate_embedding_from_url(image_url: str, student_id: str = "unknown") -> Tuple[Optional[list], Optional[str]]:
        """
        Generate face embedding from image URL
        
        Args:
            image_url: URL to the image
            student_id: Student ID for logging purposes
            
        Returns:
            Tuple of (embedding, status)
        """
        try:
            # Download image from URL
            response = requests.get(image_url, timeout=10)
            response.raise_for_status()
            
            # Convert to PIL Image
            pil_image = Image.open(io.BytesIO(response.content))
            
            # Generate embedding
            return EmbeddingGenerator.generate_embedding_from_image(pil_image)
            
        except requests.RequestException as e:
            logger.error(f"Failed to download image for {student_id}: {str(e)}")
            return None, "failed"
        except Exception as e:
            logger.error(f"Embedding generation from URL failed for {student_id}: {str(e)}")
            return None, "failed"
    
    @staticmethod
    def generate_embedding_from_blob(base64_blob: str, student_id: str = "unknown") -> Tuple[Optional[list], Optional[str]]:
        """
        Generate face embedding from base64 image blob stored in MongoDB
        
        Args:
            base64_blob: Base64 encoded image string
            student_id: Student ID for logging purposes
            
        Returns:
            Tuple of (embedding, status)
        """
        try:
            import base64
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(base64_blob)
            
            # Convert to PIL Image
            pil_image = Image.open(io.BytesIO(image_bytes))
            
            # Generate embedding
            return EmbeddingGenerator.generate_embedding_from_image(pil_image)
            
        except Exception as e:
            logger.error(f"Embedding generation from blob failed for {student_id}: {str(e)}")
            return None, "failed"
