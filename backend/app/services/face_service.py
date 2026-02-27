"""
Face Recognition Service
Handles embedding generation, face matching, and attendance recording.
Integrated with existing CMS attendance collections.

Now uses ONNX Runtime + MobileFaceNet (~20MB) instead of PyTorch (~400MB).
"""
import logging
import io
import numpy as np
import json
import os
from pathlib import Path
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Tuple
from bson import ObjectId

# Setup logging
logger = logging.getLogger('face')
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('[FACE][%(levelname)s] %(message)s'))
if not logger.handlers:
    logger.addHandler(handler)

# Lazy loading flags for ML libraries
_ml_libs_initialized = False
USE_ONNX = False
_ONNX_SESSION = None
Image = None
CV2_AVAILABLE = False
cv2 = None

def _init_ml_libs():
    """Lazily initialize ML libraries (ONNX Runtime, OpenCV).
    
    Only called when actually needed for face recognition operations,
    not at module import time to avoid slow server startup.
    
    Uses ONNX Runtime (~15MB) + MobileFaceNet (~4MB) instead of
    PyTorch (~280MB) + FaceNet (~107MB).
    """
    global _ml_libs_initialized, USE_ONNX, _ONNX_SESSION, Image, CV2_AVAILABLE, cv2
    
    if _ml_libs_initialized:
        return
    
    _ml_libs_initialized = True
    logger.info("📦 Initializing ML libraries for face recognition...")
    
    # Try to load ONNX Runtime with MobileFaceNet
    try:
        from PIL import Image as _Image
        Image = _Image
        
        # Import EmbeddingGenerator which handles ONNX model loading
        from .embedding_service import EmbeddingGenerator, _init_mobilefacenet
        
        # Initialize the ONNX model
        if _init_mobilefacenet():
            USE_ONNX = True
            logger.info("✅ MobileFaceNet ONNX loaded")
        else:
            logger.info("MobileFaceNet ONNX not available")
            
    except Exception as e:
        logger.info(f"ONNX face recognition not available: {e}")
        USE_ONNX = False

    # Try OpenCV for face detection
    try:
        import cv2 as _cv2
        cv2 = _cv2
        CV2_AVAILABLE = True
        logger.info("✅ OpenCV loaded")
    except ImportError:
        CV2_AVAILABLE = False
        logger.warning("OpenCV not available for face detection")

def _get_embedding_version():
    """Get embedding version based on available libraries."""
    _init_ml_libs()
    return "mobilefacenet_onnx_v1" if USE_ONNX else "fallback_v1"

# In-memory embedding cache
_embedding_cache: Dict[str, Dict[str, Any]] = {
    "students": {},  # {person_id: {"embedding": np.array, "name": str, ...}}
    "employees": {}
}
_cache_loaded = False


def load_cache_from_disk(cache_dir: str = "model_cache") -> Dict[str, int]:
    """Load cached embeddings from disk into in-memory cache.
    Expects files: <cache_dir>/students_embeddings.npy, <cache_dir>/students_meta.json
    and similarly for employees.
    Returns counts dict.
    """
    global _embedding_cache, _cache_loaded
    path = Path(cache_dir)
    if not path.exists():
        logger.info(f"Cache directory not found: {cache_dir}")
        return {"students": 0, "employees": 0}

    counts = {"students": 0, "employees": 0}
    for key in ("students", "employees"):
        emb_file = path / f"{key}_embeddings.npy"
        meta_file = path / f"{key}_meta.json"
        if emb_file.exists() and meta_file.exists():
            try:
                arr = np.load(str(emb_file))
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)

                for i, item in enumerate(meta):
                    person_id = item.get("person_id")
                    if person_id is None:
                        continue
                    emb = arr[i].astype(np.float32)
                    # merge embedding and meta
                    entry = {k: v for k, v in item.items() if k != "person_id"}
                    entry["embedding"] = emb
                    _embedding_cache[key][person_id] = entry

                counts[key] = len(meta)
                logger.info(f"Loaded {counts[key]} {key} from disk cache")
            except Exception as e:
                logger.error(f"Failed to load {key} cache from disk: {e}")

    if counts["students"] + counts["employees"] > 0:
        _cache_loaded = True

    return counts


def dump_cache_to_disk(cache_dir: str = "model_cache") -> Dict[str, int]:
    """Persist in-memory cache to disk for faster startup.
    Writes <cache_dir>/{students,employees}_embeddings.npy and _meta.json
    """
    global _embedding_cache
    path = Path(cache_dir)
    path.mkdir(parents=True, exist_ok=True)

    counts = {"students": 0, "employees": 0}
    for key in ("students", "employees"):
        entries = list(_embedding_cache[key].items())
        if not entries:
            continue

        ids = []
        metas = []
        arrs = []
        for person_id, data in entries:
            ids.append(person_id)
            # copy metadata excluding the embedding numpy array
            meta = {k: v for k, v in data.items() if k != "embedding"}
            meta["person_id"] = person_id
            metas.append(meta)
            arrs.append(np.array(data["embedding"], dtype=np.float32))

        try:
            emb_array = np.stack(arrs, axis=0)
            np.save(str(path / f"{key}_embeddings.npy"), emb_array)
            with open(path / f"{key}_meta.json", "w", encoding="utf-8") as f:
                json.dump(metas, f, ensure_ascii=False)
            counts[key] = len(metas)
            logger.info(f"Saved {counts[key]} {key} to disk cache")
        except Exception as e:
            logger.error(f"Failed to dump {key} cache to disk: {e}")

    return counts


class FaceRecognitionService:
    """Main service for face recognition operations"""
    
    def __init__(self, db):
        self.db = db
    
    async def load_embeddings_to_cache(self, school_id: str) -> Dict[str, int]:
        """Load all embeddings from DB into memory cache"""
        global _embedding_cache, _cache_loaded
        
        student_count = 0
        employee_count = 0
        
        logger.info(f"Loading embeddings for school: {school_id}")
        
        # Load student embeddings
        cursor = self.db.students.find({
            "school_id": school_id,
            "embedding_status": "generated",
            "face_embedding": {"$ne": None}
        })
        
        for student in cursor:
            try:
                embedding = np.array(student["face_embedding"], dtype=np.float32)
                _embedding_cache["students"][str(student["_id"])] = {
                    "embedding": embedding,
                    "name": student.get("full_name", "Unknown"),
                    "has_image": student.get("profile_image_blob") is not None,
                    "student_id": student.get("student_id"),
                    "class_id": student.get("class_id"),
                    "section": student.get("section"),
                    "roll_number": student.get("roll_number"),
                    "school_id": school_id
                }
                student_count += 1
            except Exception as e:
                logger.error(f"Failed to load embedding for student {student.get('student_id')}: {e}")
        
        # Load employee/teacher embeddings
        cursor = self.db.teachers.find({
            "school_id": school_id,
            "embedding_status": "generated",
            "face_embedding": {"$ne": None}
        })
        
        for teacher in cursor:
            try:
                embedding = np.array(teacher["face_embedding"], dtype=np.float32)
                _embedding_cache["employees"][str(teacher["_id"])] = {
                    "embedding": embedding,
                    "name": teacher.get("name", "Unknown"),
                    "has_image": teacher.get("profile_image_blob") is not None,
                    "teacher_id": teacher.get("teacher_id"),
                    "email": teacher.get("email"),
                    "school_id": school_id
                }
                employee_count += 1
            except Exception as e:
                logger.error(f"Failed to load embedding for teacher {teacher.get('teacher_id')}: {e}")
        
        _cache_loaded = True
        logger.info(f"Loaded {student_count} students, {employee_count} employees into cache")
        
        return {"students": student_count, "employees": employee_count}
    
    def refresh_cache_entry(self, person_type: str, person_id: str, data: Dict[str, Any]):
        """Update a single entry in cache"""
        global _embedding_cache
        
        if person_type == "student":
            _embedding_cache["students"][person_id] = data
        elif person_type == "employee":
            _embedding_cache["employees"][person_id] = data
        
        logger.info(f"Cache updated for {person_type}: {person_id}")
    
    def remove_from_cache(self, person_type: str, person_id: str):
        """Remove entry from cache"""
        global _embedding_cache
        
        cache_key = "students" if person_type == "student" else "employees"
        if person_id in _embedding_cache[cache_key]:
            del _embedding_cache[cache_key][person_id]
            logger.info(f"Removed from cache: {person_type} {person_id}")
    
    async def generate_embedding_from_url(self, image_url: str) -> Tuple[Optional[List[float]], Optional[str]]:
        """
        Download image from URL and generate embedding.
        DEPRECATED: Use generate_embedding_from_blob instead.
        Returns (embedding_list, error_message)
        """
        try:
            # Lazy import httpx so missing optional dependency doesn't crash startup
            try:
                import httpx
            except Exception as e:
                logger.error(f"httpx not available for downloading images: {e}")
                return None, "httpx_missing"

            # Download image
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                if response.status_code != 200:
                    return None, f"Failed to download image: HTTP {response.status_code}"
                image_data = response.content
            
            logger.info(f"Downloaded image: {len(image_data)} bytes")
            
            # Generate embedding
            embedding = self._image_bytes_to_embedding(image_data)
            
            if embedding is None:
                return None, "No face detected in image"
            
            return embedding.tolist(), None
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return None, str(e)
    
    async def generate_embedding_from_blob(self, base64_blob: str) -> Tuple[Optional[List[float]], Optional[str]]:
        """
        Generate embedding from base64 encoded image blob stored in MongoDB.
        This is the preferred method for blob-based storage.
        Returns (embedding_list, error_message)
        """
        try:
            import base64
            
            # Decode base64 to bytes
            try:
                image_data = base64.b64decode(base64_blob)
            except Exception as e:
                logger.error(f"Failed to decode base64 image: {e}")
                return None, "Invalid base64 image data"
            
            logger.info(f"Decoded image blob: {len(image_data)} bytes")
            
            # Generate embedding
            embedding = self._image_bytes_to_embedding(image_data)
            
            if embedding is None:
                return None, "No face detected in image"
            
            return embedding.tolist(), None
            
        except Exception as e:
            logger.error(f"Blob embedding generation failed: {e}")
            return None, str(e)
    
    def _image_bytes_to_embedding(self, data: bytes) -> Optional[np.ndarray]:
        """Convert image bytes to normalized embedding vector using MobileFaceNet ONNX"""
        # Lazily initialize ML libraries when first needed
        _init_ml_libs()
        
        if USE_ONNX and Image is not None:
            try:
                # Use EmbeddingGenerator from embedding_service for ONNX inference
                from .embedding_service import EmbeddingGenerator
                
                img = Image.open(io.BytesIO(data)).convert('RGB')
                
                # Use EmbeddingGenerator's face detection and embedding pipeline
                embedding_list, status = EmbeddingGenerator.generate_embedding_from_image(img)
                
                if embedding_list is not None:
                    return np.array(embedding_list, dtype=np.float32)
                
                logger.warning(f"Embedding generation failed: {status}")
                return None
                
            except Exception as e:
                logger.error(f"ONNX embedding failed: {e}")
                return None
        
        # Fallback: grayscale 64x64 (no ML required)
        if CV2_AVAILABLE:
            try:
                arr = np.frombuffer(data, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is None:
                    return None
                
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                small = cv2.resize(gray, (64, 64))
                vec = small.astype(np.float32).flatten()
                norm = np.linalg.norm(vec)
                return vec / (norm if norm != 0 else 1.0)
            except Exception as e:
                logger.error(f"Fallback embedding failed: {e}")
                return None
        
        return None
    
    def _generate_embedding_from_bytes(self, data: bytes) -> Tuple[Optional[np.ndarray], Optional[str]]:
        """Generate embedding from raw image bytes (for live recognition)"""
        embedding = self._image_bytes_to_embedding(data)
        if embedding is None:
            return None, "no_face"
        return embedding, None
    
    def compare_embedding(self, query_embedding: np.ndarray, threshold: float = 0.85) -> Optional[Dict[str, Any]]:
        """
        Compare query embedding against all cached embeddings using vectorized operations.
        This is 10-50x faster than loop-based comparison for large caches.
        Returns best match if confidence >= threshold, else None.
        """
        best_match = None
        best_confidence = 0.0
        best_person_id = None
        best_person_type = None
        
        # Normalize query embedding once
        query_norm = np.linalg.norm(query_embedding)
        if query_norm == 0:
            return None
        query_normalized = query_embedding / query_norm
        
        # Vectorized search for students
        if _embedding_cache["students"]:
            student_ids = list(_embedding_cache["students"].keys())
            student_embeddings = np.array([
                _embedding_cache["students"][pid]["embedding"] 
                for pid in student_ids
            ], dtype=np.float32)
            
            # Batch normalize all student embeddings
            norms = np.linalg.norm(student_embeddings, axis=1, keepdims=True)
            norms = np.where(norms == 0, 1, norms)  # Avoid division by zero
            student_embeddings_normalized = student_embeddings / norms
            
            # Vectorized cosine similarity (dot product of normalized vectors)
            similarities = np.dot(student_embeddings_normalized, query_normalized)
            
            # Find best match among students
            best_student_idx = np.argmax(similarities)
            if similarities[best_student_idx] > best_confidence:
                best_confidence = similarities[best_student_idx]
                best_person_id = student_ids[best_student_idx]
                best_person_type = "student"
        
        # Vectorized search for employees
        if _embedding_cache["employees"]:
            employee_ids = list(_embedding_cache["employees"].keys())
            employee_embeddings = np.array([
                _embedding_cache["employees"][pid]["embedding"] 
                for pid in employee_ids
            ], dtype=np.float32)
            
            # Batch normalize all employee embeddings
            norms = np.linalg.norm(employee_embeddings, axis=1, keepdims=True)
            norms = np.where(norms == 0, 1, norms)
            employee_embeddings_normalized = employee_embeddings / norms
            
            # Vectorized cosine similarity
            similarities = np.dot(employee_embeddings_normalized, query_normalized)
            
            # Check if any employee beats current best
            best_employee_idx = np.argmax(similarities)
            if similarities[best_employee_idx] > best_confidence:
                best_confidence = similarities[best_employee_idx]
                best_person_id = employee_ids[best_employee_idx]
                best_person_type = "employee"
        
        # Build match result if above threshold
        if best_person_id and best_confidence >= threshold:
            cache_key = "students" if best_person_type == "student" else "employees"
            data = _embedding_cache[cache_key][best_person_id]
            best_match = {
                "person_type": best_person_type,
                "person_id": best_person_id,
                "confidence": float(best_confidence),
                **{k: v for k, v in data.items() if k != "embedding"}
            }
            logger.info(f"[MATCH] {best_match.get('name', 'Unknown')} | Confidence: {best_confidence:.2f}")
            return best_match
        
        if best_person_id:
            cache_key = "students" if best_person_type == "student" else "employees"
            name = _embedding_cache[cache_key][best_person_id].get("name", "Unknown")
            logger.info(f"[RETRY] Low confidence: {best_confidence:.2f} for {name}")
        else:
            logger.info("[RETRY] No match found in cache")
        
        return None
    
    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors (kept for compatibility)"""
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))
    
    async def process_recognition(
        self,
        image_data: bytes,
        school_id: str,
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a face recognition request.
        Returns match result or retry instruction.
        """
        threshold = settings.get("confidence_threshold", 0.85)
        
        # Generate embedding from captured image
        embedding, error = self._generate_embedding_from_bytes(image_data)
        
        if error == "no_face":
            logger.info("[RETRY] No face detected")
            return {
                "status": "retry",
                "reason": "no_face",
                "message": "No face detected. Please position your face clearly."
            }
        
        if error:
            logger.error(f"[ERROR] Recognition failed: {error}")
            return {
                "status": "error",
                "reason": error,
                "message": "Recognition failed. Please try again."
            }
        
        # Compare against cache
        match = self.compare_embedding(embedding, threshold)
        
        if not match:
            return {
                "status": "retry",
                "reason": "low_confidence",
                "message": "Face unclear. Retrying..."
            }
        
        return {
            "status": "success",
            "match": match
        }
    
    async def record_attendance(
        self,
        match: Dict[str, Any],
        school_id: str,
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Record attendance for matched person"""
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        today = now.strftime("%Y-%m-%d")
        
        person_type = match["person_type"]
        person_id = match["person_id"]
        confidence = match["confidence"]
        
        if person_type == "student":
            return await self._record_student_attendance(
                match, school_id, settings, today, current_time, confidence
            )
        else:
            return await self._record_employee_attendance(
                match, school_id, settings, today, current_time, confidence
            )
    
    async def _record_student_attendance(
        self,
        match: Dict[str, Any],
        school_id: str,
        settings: Dict[str, Any],
        today: str,
        current_time: str,
        confidence: float
    ) -> Dict[str, Any]:
        """Record student attendance"""
        student_id = match.get("student_id")
        class_id = match.get("class_id")
        late_time = settings.get("late_after_time", "08:30")
        
        # Determine status
        status = "present" if current_time <= late_time else "late"
        
        # Check if already marked today
        existing = await self.db.attendance.find_one({
            "school_id": school_id,
            "student_id": student_id,
            "date": today
        })
        
        if existing:
            logger.info(f"[FACE] Attendance already marked for {student_id}")
            return {
                "already_marked": True,
                "status": existing.get("status"),
                "name": match.get("name"),
                "student_id": student_id,
                "class_id": class_id,
                "section": match.get("section"),
                "time": current_time,
                "confidence": confidence
            }
        
        # Insert attendance record
        attendance_doc = {
            "school_id": school_id,
            "class_id": class_id,
            "student_id": student_id,
            "date": today,
            "status": status,
            "source": "face",
            "confidence": confidence,
            "scan_time": current_time,
            "notes": f"Face recognition at {current_time}",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await self.db.attendance.insert_one(attendance_doc)
        logger.info(f"[FACE][SUCCESS] Recorded {status} for student: {student_id}")
        
        # Log activity
        await self._log_activity(
            school_id=school_id,
            person_type="student",
            person_id=str(match["person_id"]),
            person_name=match.get("name", "Unknown"),
            action=status,
            confidence=confidence,
            class_id=class_id,
            section=match.get("section")
        )
        
        return {
            "already_marked": False,
            "status": status,
            "name": match.get("name"),
            "student_id": student_id,
            "class_id": class_id,
            "section": match.get("section"),
            "roll_number": match.get("roll_number"),
            "time": current_time,
            "confidence": confidence
        }
    
    async def _record_employee_attendance(
        self,
        match: Dict[str, Any],
        school_id: str,
        settings: Dict[str, Any],
        today: str,
        current_time: str,
        confidence: float
    ) -> Dict[str, Any]:
        """Record employee check-in/check-out"""
        teacher_id = match.get("teacher_id")
        late_time = settings.get("employee_late_after", "08:30")
        
        # Check existing record for today
        existing = await self.db.employee_attendance.find_one({
            "school_id": school_id,
            "teacher_id": teacher_id,
            "date": today
        })
        
        if existing:
            if existing.get("check_out_time"):
                logger.info(f"[FACE] Employee {teacher_id} already checked out")
                return {
                    "action": "already_checked_out",
                    "name": match.get("name"),
                    "teacher_id": teacher_id,
                    "check_in": existing.get("check_in_time"),
                    "check_out": existing.get("check_out_time"),
                    "confidence": confidence
                }
            
            # Record check-out
            await self.db.employee_attendance.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "check_out_time": current_time,
                        "check_out_confidence": confidence,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            logger.info(f"[FACE][SUCCESS] Check-out recorded for employee: {teacher_id}")
            
            await self._log_activity(
                school_id=school_id,
                person_type="employee",
                person_id=str(match["person_id"]),
                person_name=match.get("name", "Unknown"),
                action="check_out",
                confidence=confidence
            )
            
            return {
                "action": "check_out",
                "name": match.get("name"),
                "teacher_id": teacher_id,
                "time": current_time,
                "confidence": confidence
            }
        
        # Record check-in
        status = "present" if current_time <= late_time else "late"
        
        attendance_doc = {
            "school_id": school_id,
            "teacher_id": teacher_id,
            "date": today,
            "status": status,
            "check_in_time": current_time,
            "check_in_confidence": confidence,
            "source": "face",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await self.db.employee_attendance.insert_one(attendance_doc)
        logger.info(f"[FACE][SUCCESS] Check-in recorded for employee: {teacher_id} ({status})")
        
        await self._log_activity(
            school_id=school_id,
            person_type="employee",
            person_id=str(match["person_id"]),
            person_name=match.get("name", "Unknown"),
            action="check_in" if status == "present" else "late",
            confidence=confidence
        )
        
        return {
            "action": "check_in",
            "status": status,
            "name": match.get("name"),
            "teacher_id": teacher_id,
            "time": current_time,
            "confidence": confidence
        }
    
    async def _log_activity(
        self,
        school_id: str,
        person_type: str,
        person_id: str,
        person_name: str,
        action: str,
        confidence: float,
        class_id: Optional[str] = None,
        section: Optional[str] = None
    ):
        """Log face activity for dashboard"""
        await self.db.face_activity_logs.insert_one({
            "school_id": school_id,
            "person_type": person_type,
            "person_id": person_id,
            "person_name": person_name,
            "action": action,
            "confidence": confidence,
            "class_id": class_id,
            "section": section,
            "timestamp": datetime.utcnow()
        })
    
    async def get_dashboard_stats(self, school_id: str) -> Dict[str, Any]:
        """Get face recognition dashboard statistics"""
        # Get class-wise stats
        pipeline = [
            {"$match": {"school_id": school_id, "status": "active"}},
            {"$group": {
                "_id": {"class_id": "$class_id", "section": "$section"},
                "total": {"$sum": 1},
                "face_ready": {
                    "$sum": {"$cond": [{"$eq": ["$embedding_status", "generated"]}, 1, 0]}
                },
                "pending": {
                    "$sum": {"$cond": [
                        {"$or": [
                            {"$eq": ["$embedding_status", "pending"]},
                            {"$eq": ["$embedding_status", None]}
                        ]},
                        1, 0
                    ]}
                }
            }}
        ]
        
        class_stats = []
        for stat in self.db.students.aggregate(pipeline):
            class_stats.append({
                "class_id": stat["_id"]["class_id"],
                "section": stat["_id"]["section"],
                "total": stat["total"],
                "face_ready": stat["face_ready"],
                "pending": stat["pending"]
            })
        
        # Get employee stats
        employee_stats = list(self.db.teachers.aggregate([
            {"$match": {"school_id": school_id}},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "face_ready": {
                    "$sum": {"$cond": [{"$eq": ["$embedding_status", "generated"]}, 1, 0]}
                },
                "pending": {
                    "$sum": {"$cond": [
                        {"$or": [
                            {"$eq": ["$embedding_status", "pending"]},
                            {"$eq": ["$embedding_status", None]}
                        ]},
                        1, 0
                    ]}
                }
            }}
        ]))
        
        emp_stat = employee_stats[0] if employee_stats else {"total": 0, "face_ready": 0, "pending": 0}
        
        return {
            "classes": class_stats,
            "employees": {
                "total": emp_stat.get("total", 0),
                "face_ready": emp_stat.get("face_ready", 0),
                "pending": emp_stat.get("pending", 0)
            }
        }
    
    async def get_today_activity(self, school_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get today's face recognition activity"""
        today_start = datetime.combine(date.today(), datetime.min.time())
        
        cursor = self.db.face_activity_logs.find({
            "school_id": school_id,
            "timestamp": {"$gte": today_start}
        }).sort("timestamp", -1).limit(limit)
        
        activities = []
        for log in cursor:
            activities.append({
                "id": str(log["_id"]),
                "person_type": log["person_type"],
                "person_name": log["person_name"],
                "action": log["action"],
                "confidence": log["confidence"],
                "class_id": log.get("class_id"),
                "section": log.get("section"),
                "time": log["timestamp"].strftime("%H:%M")
            })
        
        return activities


class EmbeddingGenerationService:
    """Service for bulk embedding generation"""
    
    def __init__(self, db, face_service: FaceRecognitionService):
        self.db = db
        self.face_service = face_service
    
    async def generate_missing_embeddings(
        self,
        school_id: str,
        person_type: str,
        class_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate embeddings for records missing them"""
        collection = self.db.students if person_type == "student" else self.db.teachers
        
        query = {
            "school_id": school_id,
            "$or": [
                {"embedding_status": {"$ne": "generated"}},
                {"embedding_status": None}
            ]
        }
        
        if person_type == "student":
            query["profile_image_url"] = {"$ne": None}
            if class_id:
                query["class_id"] = class_id
        else:
            query["profile_image_url"] = {"$ne": None}
        
        cursor = collection.find(query)
        
        success_count = 0
        failed_count = 0
        total = 0
        
        async for record in cursor:
            total += 1
            record_id = str(record["_id"])
            image_url = record.get("profile_image_url")
            identifier = record.get("student_id") if person_type == "student" else record.get("teacher_id")
            
            if not image_url:
                logger.info(f"[FACE] Skipping {identifier}: No image")
                continue
            
            logger.info(f"[FACE][INFO] Generating embedding for {person_type}: {identifier}")
            
            embedding, error = await self.face_service.generate_embedding_from_url(image_url)
            
            if embedding:
                await collection.update_one(
                    {"_id": record["_id"]},
                    {
                        "$set": {
                            "face_embedding": embedding,
                            "embedding_status": "generated",
                            "embedding_generated_at": datetime.utcnow(),
                            "embedding_model": "mobilefacenet_onnx" if USE_ONNX else "fallback",
                            "embedding_version": _get_embedding_version()
                        }
                    }
                )
                logger.info(f"[FACE][SUCCESS] Embedding stored for {person_type}: {identifier}")
                
                # Update cache
                cache_data = {
                    "embedding": np.array(embedding, dtype=np.float32),
                    "name": record.get("full_name") if person_type == "student" else record.get("name"),
                    "profile_image_url": record.get("profile_image_url"),
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
                
                self.face_service.refresh_cache_entry(
                    "student" if person_type == "student" else "employee",
                    record_id,
                    cache_data
                )
                success_count += 1
            else:
                await collection.update_one(
                    {"_id": record["_id"]},
                    {
                        "$set": {
                            "embedding_status": "failed",
                            "embedding_error": error
                        }
                    }
                )
                logger.error(f"[FACE][ERROR] Embedding failed for {person_type}: {identifier} - {error}")
                failed_count += 1
        
        return {
            "total": total,
            "success": success_count,
            "failed": failed_count
        }
    
    async def regenerate_all_embeddings(
        self,
        school_id: str,
        person_type: str,
        class_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Regenerate ALL embeddings (refresh)"""
        collection = self.db.students if person_type == "student" else self.db.teachers
        
        query = {
            "school_id": school_id,
            "profile_image_url": {"$ne": None}
        }
        if person_type == "student" and class_id:
            query["class_id"] = class_id
        
        # Clear existing embeddings first
        await collection.update_many(
            query,
            {
                "$set": {
                    "embedding_status": "pending",
                    "face_embedding": None
                }
            }
        )
        
        # Clear cache for this school
        global _embedding_cache
        cache_key = "students" if person_type == "student" else "employees"
        _embedding_cache[cache_key] = {
            k: v for k, v in _embedding_cache[cache_key].items()
            if v.get("school_id") != school_id
        }
        
        # Generate new embeddings
        return await self.generate_missing_embeddings(school_id, person_type, class_id)
    
    async def regenerate_single_embedding(
        self,
        school_id: str,
        person_type: str,
        person_id: str
    ) -> Dict[str, Any]:
        """Regenerate embedding for a single person"""
        collection = self.db.students if person_type == "student" else self.db.teachers
        
        record = await collection.find_one({"_id": ObjectId(person_id), "school_id": school_id})
        
        if not record:
            return {"success": False, "error": "Record not found"}
        
        image_url = record.get("profile_image_url")
        if not image_url:
            return {"success": False, "error": "No profile image"}
        
        identifier = record.get("student_id") if person_type == "student" else record.get("teacher_id")
        logger.info(f"[FACE][INFO] Regenerating embedding for {person_type}: {identifier}")
        
        embedding, error = await self.face_service.generate_embedding_from_url(image_url)
        
        if embedding:
            await collection.update_one(
                {"_id": ObjectId(person_id)},
                {
                    "$set": {
                        "face_embedding": embedding,
                        "embedding_status": "generated",
                        "embedding_generated_at": datetime.utcnow(),
                        "embedding_model": "mobilefacenet_onnx" if USE_ONNX else "fallback",
                        "embedding_version": _get_embedding_version()
                    }
                }
            )
            logger.info(f"[FACE][SUCCESS] Embedding regenerated for {person_type}: {identifier}")
            
            # Update cache
            cache_data = {
                "embedding": np.array(embedding, dtype=np.float32),
                "name": record.get("full_name") if person_type == "student" else record.get("name"),
                "profile_image_url": record.get("profile_image_url"),
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
            
            self.face_service.refresh_cache_entry(
                "student" if person_type == "student" else "employee",
                person_id,
                cache_data
            )
            
            return {"success": True}
        else:
            await collection.update_one(
                {"_id": ObjectId(person_id)},
                {
                    "$set": {
                        "embedding_status": "failed",
                        "embedding_error": error
                    }
                }
            )
            logger.error(f"[FACE][ERROR] Regeneration failed for {person_type}: {identifier} - {error}")
            return {"success": False, "error": error}


# Settings service
class FaceSettingsService:
    """Service for face recognition settings"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_settings(self, school_id: str) -> Dict[str, Any]:
        """Get settings for school, create default if not exists"""
        settings = await self.db.face_settings.find_one({"school_id": school_id})
        
        if not settings:
            default_settings = {
                "school_id": school_id,
                "school_start_time": "08:00",
                "late_after_time": "08:30",
                "auto_absent_time": "09:00",
                "employee_checkin_time": "08:00",
                "employee_late_after": "08:30",
                "employee_checkout_time": "17:00",
                "confidence_threshold": 0.85,
                "max_retry_attempts": 5,
                "students_enabled": True,
                "employees_enabled": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            await self.db.face_settings.insert_one(default_settings)
            settings = default_settings
        
        settings["id"] = str(settings.get("_id", ""))
        return settings
    
    async def update_settings(self, school_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update settings"""
        updates["updated_at"] = datetime.utcnow()
        
        await self.db.face_settings.update_one(
            {"school_id": school_id},
            {"$set": updates},
            upsert=True
        )
        
        return await self.get_settings(school_id)
