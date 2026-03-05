"""
Face Embedding Generation Service (ONNX Runtime, ArcFace ResNet100)

This service generates face embeddings using:
- ONNX Runtime for inference (~15MB)
- ArcFace ResNet100 model (~170MB) for high-accuracy embeddings
- OpenCV Haar Cascade for face detection (~1MB)

Total: ~186MB - significantly more accurate than MobileFaceNet while staying under 500MB.
Optimized for deployment with <0.5GB RAM usage.
"""
import numpy as np
import logging
from typing import Optional, Tuple, List
from PIL import Image
import io
import requests
import os

logger = logging.getLogger(__name__)

# OpenCV for face detection (lightweight, no ML)
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    logger.warning("OpenCV not available - face detection will be limited")

# Lazy-load ArcFace ResNet100 ONNX model
_ONNX_SESSION = None
_ONNX_INITIALIZED = False
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "model_cache")

# ArcFace ResNet100 ONNX model URL (pre-trained on MS1MV2, very high accuracy)
_ARCFACE_RESNET100_URL = "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/arcface/model/arcfaceresnet100-8.onnx"
# Fallback: Alternative ArcFace model
_ARCFACE_FALLBACK_URL = "https://huggingface.co/onnx/ArcFace/resolve/main/arcfaceresnet100-8.onnx"


def _download_model(url: str, path: str) -> bool:
    """Download ONNX model from URL."""
    # Robust download with retries and exponential backoff. If the download
    # fails part-way, the partial file is removed so that subsequent attempts
    # start from a clean state.
    attempts = 3
    backoff_base = 2
    os.makedirs(os.path.dirname(path), exist_ok=True)

    for attempt in range(1, attempts + 1):
        try:
            logger.info(f"📥 Downloading face model to {path} (attempt {attempt}/{attempts})...")
            response = requests.get(url, timeout=120, stream=True)
            response.raise_for_status()

            # Write to a temporary file first
            tmp_path = path + ".part"
            with open(tmp_path, 'wb') as f:
                total_written = 0
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_written += len(chunk)

            # If server provided a content-length header, verify we got everything
            content_len = response.headers.get('Content-Length')
            if content_len is not None:
                try:
                    expected = int(content_len)
                    if total_written < expected:
                        raise IOError(f"Incomplete download: {total_written} of {expected} bytes")
                except ValueError:
                    # ignore non-integer headers
                    pass

            # Move temp file into final path
            os.replace(tmp_path, path)
            logger.info(f"✅ Model downloaded: {os.path.getsize(path) / 1024 / 1024:.1f}MB")
            return True

        except Exception as e:
            logger.error(f"Model download failed (attempt {attempt}): {e}")
            # Clean up partial file if exists
            try:
                if os.path.exists(path + ".part"):
                    os.remove(path + ".part")
            except Exception:
                pass

            if attempt < attempts:
                sleep_sec = backoff_base ** (attempt - 1)
                logger.info(f"Retrying download in {sleep_sec}s...")
                try:
                    import time
                    time.sleep(sleep_sec)
                except Exception:
                    pass
                continue
            else:
                logger.error("Failed to download face model after multiple attempts")
                return False


def _init_arcface() -> bool:
    """
    Lazily initialize ArcFace ResNet100 ONNX model.
    Called on first embedding request, not at module import.
    Downloads model if not present (~170MB, high accuracy).
    
    Returns True if model is available.
    """
    global _ONNX_SESSION, _ONNX_INITIALIZED
    
    if _ONNX_INITIALIZED:
        return _ONNX_SESSION is not None
    
    _ONNX_INITIALIZED = True
    
    try:
        import onnxruntime as ort
        
        # Set ONNX Runtime options for CPU optimization
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 2  # Limit threads for Heroku
        sess_options.inter_op_num_threads = 2
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # Model path
        model_path = os.path.join(_MODEL_DIR, "arcface_resnet100.onnx")
        
        # Download model if not exists
        if not os.path.exists(model_path):
            logger.info("📦 ArcFace ResNet100 model not found, downloading (~170MB)...")
            # Try primary URL first, then fallback
            if not _download_model(_ARCFACE_RESNET100_URL, model_path):
                if not _download_model(_ARCFACE_FALLBACK_URL, model_path):
                    logger.error("Failed to download face model")
                    return False
        
        # Load ONNX model
        logger.info(f"📦 Loading ArcFace ResNet100 ONNX model...")
        _ONNX_SESSION = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=['CPUExecutionProvider']
        )
        
        # Log model info
        input_info = _ONNX_SESSION.get_inputs()[0]
        output_info = _ONNX_SESSION.get_outputs()[0]
        logger.info(f"✅ ArcFace ResNet100 loaded - Input: {input_info.shape}, Output: {output_info.shape}")
        
        return True
        
    except ImportError as e:
        logger.error(f"ONNX Runtime not available: {e}")
        return False
    except Exception as e:
        logger.error(f"ArcFace ResNet100 initialization failed: {e}")
        return False


class FaceDetectionError(Exception):
    """Raised when face detection fails"""
    pass


class EmbeddingGenerator:
    """
    Face embedding generator using ArcFace ResNet100 (ONNX Runtime).
    
    Produces 512-dimensional normalized embeddings.
    Uses OpenCV Haar Cascade for face detection.
    ~186MB total, much higher accuracy than MobileFaceNet.
    """
    
    # ArcFace ResNet100 produces 512-dimensional embeddings
    EMBEDDING_MODEL = "ArcFace-ResNet100-ONNX"
    EMBEDDING_DIMENSION = 512
    
    @staticmethod
    def normalize_embedding(embedding: np.ndarray) -> list:
        """
        Normalize embedding vector to unit length (L2 normalization).
        
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
    def detect_face_opencv(image_array: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """
        Detect face using OpenCV Haar Cascade.
        
        Args:
            image_array: RGB numpy array
            
        Returns:
            Tuple (x, y, w, h) of face bounding box, or None
        """
        if not HAS_CV2:
            return None
        
        try:
            # Convert to grayscale
            if len(image_array.shape) == 3:
                gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
            else:
                gray = image_array
            
            # Apply CLAHE for better contrast
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
            
            # Load Haar Cascade
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            cascade = cv2.CascadeClassifier(cascade_path)
            
            # Try detection with standard parameters
            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=3,
                minSize=(30, 30)
            )
            
            # If no face found, try more lenient parameters
            if len(faces) == 0:
                faces = cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.2,
                    minNeighbors=2,
                    minSize=(20, 20)
                )
            
            if len(faces) > 0:
                # Return largest face
                return tuple(max(faces, key=lambda f: f[2] * f[3]))
            
            return None
            
        except Exception as e:
            logger.warning(f"OpenCV face detection failed: {e}")
            return None
    
    @staticmethod
    def detect_and_crop_face(pil_image: Image.Image) -> Optional[Image.Image]:
        """
        Detect face in image and return cropped face.
        
        Args:
            pil_image: PIL Image object
            
        Returns:
            Cropped face image or None if no face detected
        """
        try:
            # Convert PIL to numpy array
            image_array = np.array(pil_image)
            
            # Ensure 3-channel RGB image
            if len(image_array.shape) == 2:  # Grayscale
                image_array = np.stack([image_array] * 3, axis=-1)
            elif image_array.shape[2] == 4:  # RGBA
                image_array = image_array[:, :, :3]
            
            # Detect face with OpenCV
            face_coords = EmbeddingGenerator.detect_face_opencv(image_array)
            
            if face_coords:
                x, y, w, h = face_coords
                # Crop with padding for better embedding quality
                pad = 0.3
                x0 = max(0, int(x - w * pad / 2))
                y0 = max(0, int(y - h * pad / 2))
                x1 = min(image_array.shape[1], int(x + w + w * pad / 2))
                y1 = min(image_array.shape[0], int(y + h + h * pad / 2))
                
                cropped = image_array[y0:y1, x0:x1]
                logger.info(f"Face detected and cropped: {w}x{h}")
                return Image.fromarray(cropped.astype("uint8"))
            
            # No face detected - use full image (let model handle it)
            logger.warning("No face detected, using full image")
            return pil_image
            
        except Exception as e:
            logger.error(f"Face detection error: {str(e)}")
            raise FaceDetectionError(f"Face detection failed: {str(e)}")
    
    @staticmethod
    def _preprocess_for_onnx(face_image: Image.Image) -> np.ndarray:
        """
        Preprocess face image for ONNX ArcFace ResNet100 inference.
        
        Args:
            face_image: PIL Image of cropped face
            
        Returns:
            Numpy array in NCHW format, normalized to [-1, 1]
        """
        # Ensure RGB
        if face_image.mode != 'RGB':
            face_image = face_image.convert('RGB')
        
        # Resize to model input size (112x112 for most face models)
        face_image = face_image.resize((112, 112), Image.Resampling.LANCZOS)
        
        # Convert to numpy array
        img_array = np.array(face_image, dtype=np.float32)
        
        # Normalize to [-1, 1] (standard for face models)
        img_array = (img_array - 127.5) / 127.5
        
        # Convert HWC to NCHW format
        img_array = np.transpose(img_array, (2, 0, 1))  # CHW
        img_array = np.expand_dims(img_array, axis=0)   # NCHW
        
        return img_array.astype(np.float32)
    
    @staticmethod
    def generate_embedding(cropped_face: Image.Image) -> Optional[list]:
        """
        Generate face embedding from cropped face image using ArcFace ResNet100 ONNX.
        
        Args:
            cropped_face: PIL Image of cropped face
            
        Returns:
            Normalized 512-dim embedding vector as list, or None if failed
        """
        if not _init_arcface():
            logger.error("ArcFace ResNet100 ONNX not available for embedding generation")
            return None
        
        try:
            # Preprocess image for ONNX inference
            input_tensor = EmbeddingGenerator._preprocess_for_onnx(cropped_face)
            
            # Get input name from model
            input_name = _ONNX_SESSION.get_inputs()[0].name
            
            # Run ONNX inference
            outputs = _ONNX_SESSION.run(None, {input_name: input_tensor})
            
            # Get embedding from output
            embedding = outputs[0].flatten().astype(np.float32)
            
            # Normalize embedding
            return EmbeddingGenerator.normalize_embedding(embedding)
            
        except Exception as e:
            logger.error(f"Embedding generation error: {str(e)}")
            return None
    
    @staticmethod
    def generate_embedding_from_image(pil_image: Image.Image) -> Tuple[Optional[list], str]:
        """
        Complete pipeline: detect face, crop, and generate embedding.
        
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
    def generate_embedding_from_url(image_url: str, student_id: str = "unknown") -> Tuple[Optional[list], str]:
        """
        Generate face embedding from image URL.
        
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
    def generate_embedding_from_blob(base64_blob: str, student_id: str = "unknown") -> Tuple[Optional[list], str]:
        """
        Generate face embedding from base64 image blob stored in MongoDB.
        
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

