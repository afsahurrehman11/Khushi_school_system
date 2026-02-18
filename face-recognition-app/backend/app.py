from fastapi import FastAPI, File, UploadFile, Form, Header, HTTPException
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
import numpy as np
import cv2
import os
from PIL import Image as PILImage
import io
import json
import shutil
import zipfile
from typing import List
import logging
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import socket

# Optional FaceNet + MTCNN integration (facenet-pytorch)
USE_FACENET = False
FACENET_MODEL = None
USE_MTCNN = False
MTCNN_MODEL = None
TORCH = None
Image = None
try:
    import torch as _torch  # type: ignore[reportMissingImports]
    TORCH = _torch
    from facenet_pytorch import InceptionResnetV1, MTCNN  # type: ignore[reportMissingImports]
    from PIL import Image as _Image  # type: ignore[reportMissingImports]
    Image = _Image
    # initialize FaceNet model (cpu by default); move to available device later
    FACENET_MODEL = InceptionResnetV1(pretrained='vggface2').eval()
    USE_FACENET = True
    # MTCNN will be instantiated later once device is determined
    USE_MTCNN = True
except Exception:
    # facenet / mtcnn not available; will fall back to lightweight demo embedding
    USE_FACENET = False
    FACENET_MODEL = None
    USE_MTCNN = False
    MTCNN_MODEL = None

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
REGISTRY_PATH = os.path.join(DATA_DIR, "registry.json")
EMBEDDINGS_PATH = os.path.join(DATA_DIR, "embeddings.npy")
ATTENDANCE_PATH = os.path.join(DATA_DIR, "attendance.json")

os.makedirs(IMAGES_DIR, exist_ok=True)

# logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('face-id')

# readiness flag
READY = False

# Configuration from environment
API_KEY = os.getenv('API_KEY')
FACE_MATCH_THRESHOLD = float(os.getenv('FACE_MATCH_THRESHOLD', '0.30'))  # Very low threshold for high sensitivity
USE_MTCNN_DETECTION = os.getenv('USE_MTCNN_DETECTION', '0').lower() in ('1', 'true', 'yes')
MIN_FACE_SIZE = 40  # Minimum face size in pixels

# If facenet is available, move to CUDA if present
DEVICE = None
if USE_FACENET and FACENET_MODEL is not None:
    try:
        DEVICE = TORCH.device('cuda' if TORCH.cuda.is_available() else 'cpu')
        FACENET_MODEL = FACENET_MODEL.to(DEVICE)
    except Exception:
        DEVICE = None

# instantiate MTCNN detector on same device if available
try:
    if USE_MTCNN and MTCNN_MODEL is None:
        MTCNN_MODEL = MTCNN(keep_all=False, device=DEVICE if DEVICE is not None else 'cpu')
except Exception:
    MTCNN_MODEL = None
    USE_MTCNN = False


def align_face(img_array, face_box):
    """Align face using simple geometric transformation based on face center."""
    try:
        x, y, w, h = face_box
        # Extract face region with padding
        pad = 0.3
        x1 = max(0, int(x - w * pad))
        y1 = max(0, int(y - h * pad))
        x2 = min(img_array.shape[1], int(x + w * (1 + pad)))
        y2 = min(img_array.shape[0], int(y + h * (1 + pad)))
        face_region = img_array[y1:y2, x1:x2]
        return face_region
    except Exception:
        return img_array

def check_image_quality(img_array, face_box=None):
    """Check if image quality is sufficient for recognition."""
    try:
        # Check if image is too small
        if img_array.shape[0] < 50 or img_array.shape[1] < 50:
            logger.warning('Image too small')
            return False
        # Check blur using Laplacian variance
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY) if len(img_array.shape) == 3 else img_array
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 50:  # Very lenient threshold
            logger.warning(f'Image might be blurry (variance: {laplacian_var:.2f})')
        # Check face size if provided
        if face_box is not None:
            x, y, w, h = face_box
            if w < MIN_FACE_SIZE or h < MIN_FACE_SIZE:
                logger.warning(f'Face too small: {w}x{h}')
                return False
        return True
    except Exception:
        return True  # Don't fail on quality check errors

def image_bytes_to_embedding(data: bytes) -> np.ndarray:
    """Return a normalized embedding vector. Uses FaceNet (if available) or a demo grayscale vector.
    """
    if USE_FACENET and FACENET_MODEL is not None:
        # Use facenet-pytorch model; prefer MTCNN for detection+alignment if available
        img = Image.open(io.BytesIO(data)).convert('RGB')
        # Try MTCNN to get aligned face crop (optional, can be slow on CPU)
        if USE_MTCNN and MTCNN_MODEL is not None and USE_MTCNN_DETECTION:
            try:
                face_t = MTCNN_MODEL(img)
                if face_t is not None:
                    if TORCH is None:
                        raise RuntimeError('Torch is required for MTCNN output handling')
                    # ensure batch dim
                    t = face_t.unsqueeze(0) if face_t.dim() == 3 else face_t
                    if DEVICE is not None:
                        t = t.to(DEVICE)
                    # normalize to [-1,1] if values are in [0,1]
                    try:
                        if t.max() <= 1.0:
                            t = (t - 0.5) / 0.5
                    except Exception:
                        pass
                    with TORCH.no_grad():
                        emb = FACENET_MODEL(t)
                    vec = emb.detach().cpu().numpy().flatten().astype(np.float32)
                    norm = np.linalg.norm(vec)
                    return vec / (norm if norm != 0 else 1.0)
            except Exception:
                # fall back to legacy transform if MTCNN fails for any reason
                pass

        # If MTCNN not available or failed, try OpenCV cascade to detect face and crop with padding
        try:
            # convert PIL->BGR numpy for OpenCV
            arr = np.asarray(img)[:, :, ::-1].copy()
            original_arr = arr.copy()
            gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
            
            # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) for better local contrast
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            gray = clahe.apply(gray)
            
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            cascade = cv2.CascadeClassifier(cascade_path)
            
            # Try multiple detection strategies (optimized for speed vs accuracy)
            faces = []
            # Strategy 1: Balanced (fast and accurate for most cases)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
            if len(faces) == 0:
                # Strategy 2: More relaxed for difficult cases
                faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=2, minSize=(20, 20))
            
            if len(faces) > 0:
                # choose largest face
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                logger.info(f'Detected face: {w}x{h} at ({x},{y})')
                
                # Quality check
                check_image_quality(original_arr, (x, y, w, h))
                
                # Align and crop face
                aligned = align_face(original_arr, (x, y, w, h))
                
                # Convert back to PIL with larger padding
                pad = 0.7  # Even larger padding
                x0 = max(0, int(x - (w * pad) / 2))
                y0 = max(0, int(y - (h * pad) / 2))
                x1 = min(img.width, int(x + w + (w * pad) / 2))
                y1 = min(img.height, int(y + h + (h * pad) / 2))
                img = img.crop((x0, y0, x1, y1))
                logger.info(f'Cropped to: {img.width}x{img.height}')
            else:
                logger.warning('No face detected, using full image')
        except Exception as e:
            logger.warning(f'Face detection failed: {e}')
            pass

        # Resize to 160x160 (FaceNet input size) using high-quality Lanczos resampling
        from PIL import Image as PILImage
        img = img.resize((160, 160), PILImage.Resampling.LANCZOS)
        # transform to tensor
        try:
            import torchvision.transforms as transforms
            trans = transforms.Compose([transforms.ToTensor(), transforms.Normalize([0.5,0.5,0.5],[0.5,0.5,0.5])])
            t = trans(img).unsqueeze(0)
        except Exception:
            # minimal manual transform
            arr = np.asarray(img).astype(np.float32) / 255.0
            arr = (arr - 0.5) / 0.5
            if TORCH is None:
                raise RuntimeError('Torch is required for FaceNet transforms')
            t = TORCH.tensor(arr).permute(2,0,1).unsqueeze(0)
        if DEVICE is not None and TORCH is not None:
            t = t.to(DEVICE)
        if TORCH is not None:
            with TORCH.no_grad():
                emb = FACENET_MODEL(t)
        else:
            raise RuntimeError('Torch is required for FaceNet inference')
        vec = emb.detach().cpu().numpy().flatten().astype(np.float32)
        # normalize
        norm = np.linalg.norm(vec)
        return vec / (norm if norm != 0 else 1.0)

    # Fallback demo embedding: grayscale 64x64
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    # try to detect face area and crop (so fallback embeddings focus on face region)
    try:
        gray_full = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Apply CLAHE for better contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        gray_full = clahe.apply(gray_full)
        
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        cascade = cv2.CascadeClassifier(cascade_path)
        # Optimized detection (2 passes max)
        faces = cascade.detectMultiScale(gray_full, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
        if len(faces) == 0:
            faces = cascade.detectMultiScale(gray_full, scaleFactor=1.2, minNeighbors=2, minSize=(20, 20))
        
        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            # Larger padding for more context
            pad = 0.7
            x0 = max(0, int(x - (w * pad) / 2))
            y0 = max(0, int(y - (h * pad) / 2))
            x1 = min(img.shape[1], int(x + w + (w * pad) / 2))
            y1 = min(img.shape[0], int(y + h + (h * pad) / 2))
            face_roi = gray_full[y0:y1, x0:x1]
            small = cv2.resize(face_roi, (64, 64))
        else:
            gray = gray_full
            small = cv2.resize(gray, (64, 64))
    except Exception:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (64, 64))
    vec = small.astype(np.float32).flatten()
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm

def load_attendance():
    """Load attendance records from JSON file."""
    if os.path.exists(ATTENDANCE_PATH):
        with open(ATTENDANCE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_attendance(attendance: list):
    """Save attendance records to JSON file."""
    os.makedirs(os.path.dirname(ATTENDANCE_PATH), exist_ok=True)
    with open(ATTENDANCE_PATH, 'w', encoding='utf-8') as f:
        json.dump(attendance, f, ensure_ascii=False, indent=2)

def load_registry():
    if os.path.exists(REGISTRY_PATH) and os.path.exists(EMBEDDINGS_PATH):
        with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
            registry = json.load(f)
        embeddings = np.load(EMBEDDINGS_PATH)
        return registry, embeddings
    return [], np.empty((0, 64*64), dtype=np.float32)

def save_registry(registry: List[dict], embeddings: np.ndarray):
    os.makedirs(os.path.dirname(REGISTRY_PATH), exist_ok=True)
    with open(REGISTRY_PATH, 'w', encoding='utf-8') as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    np.save(EMBEDDINGS_PATH, embeddings)

registry, embeddings = load_registry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global READY
    logger.info('Starting Face Identity Module')
    logger.info(f'USE_FACENET={USE_FACENET}')
    if USE_FACENET and FACENET_MODEL is not None:
        try:
            dev = str(DEVICE) if DEVICE is not None else 'cpu'
            logger.info(f'FaceNet model loaded on {dev}')
        except Exception:
            logger.exception('Error checking device')
    else:
        logger.info('FaceNet not available — using demo embedding')

    logger.info(f'Registry count={len(registry)}')
    try:
        logger.info(f'Embeddings shape={embeddings.shape}')
    except Exception:
        logger.info('No embeddings loaded')

    # readiness: recognition model (FaceNet) optional; fallback is considered ready
    if USE_FACENET:
        READY = FACENET_MODEL is not None
    else:
        READY = True
    logger.info(f'READY={READY}')
    try:
        yield
    finally:
        logger.info('Shutting down Face Identity Module')


# create app with lifespan handler to avoid deprecated on_event
app = FastAPI(title="Face Identity Module (demo)", lifespan=lifespan)

# Allow CORS for development (adjust for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def simple_request_logger(request, call_next):
    try:
        client = request.client.host if request.client else 'unknown'
    except Exception:
        client = 'unknown'
    logger.info(f"Incoming request: {request.method} {request.url.path} from {client} headers={dict(request.headers)}")
    response = await call_next(request)
    logger.info(f"Response: {request.method} {request.url.path} -> {response.status_code}")
    return response


@app.post('/client-log')
async def client_log(payload: dict):
    """Accept JSON logs from browser clients for debugging. Example payload: {level: 'info', msg: '...'}"""
    try:
        level = payload.get('level', 'info')
        msg = payload.get('msg') or payload.get('message') or str(payload)
        extra = payload.get('meta')
        if level == 'error':
            logger.error(f"[client] {msg} {extra if extra else ''}")
        elif level == 'warn' or level == 'warning':
            logger.warning(f"[client] {msg} {extra if extra else ''}")
        else:
            logger.info(f"[client] {msg} {extra if extra else ''}")
        return {"status": "ok"}
    except Exception as e:
        logger.exception('Failed to log client message')
        return JSONResponse({"error": str(e)}, status_code=500)



def _require_api_key(x_api_key: str = None):
    if API_KEY:
        if x_api_key is None:
            raise HTTPException(status_code=401, detail='API key required')
        if x_api_key != API_KEY:
            raise HTTPException(status_code=403, detail='Invalid API key')
    return True


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'use_facenet': USE_FACENET,
        'device': str(DEVICE) if DEVICE is not None else 'fallback',
        'registry_count': len(registry),
        'embeddings_count': int(embeddings.shape[0]) if hasattr(embeddings, 'shape') else 0,
        'ready': READY
    }

@app.post("/enroll")
async def enroll(name: str = Form(...), student_id: str = Form(...), role: str = Form('student'), hourly_rate: float = Form(None), phone: str = Form(None), principal_phone: str = Form(None), time_in: str = Form(None), time_out: str = Form(None), file: UploadFile = File(...), x_api_key: str = Header(None)):
    """Enroll a single canonical image for a person (one image per person).
    Saves image and computes embedding; appends to registry.
    """
    global registry, embeddings
    content = await file.read()
    try:
        emb = image_bytes_to_embedding(content)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # write debug info about embedding dimensionality (helpful when switching models)
    try:
        dbg_path = os.path.join(os.path.dirname(__file__), '..', 'logs', 'recognize_debug.txt')
        with open(dbg_path, 'a', encoding='utf-8') as f:
            try:
                emb_len = int(getattr(emb, 'shape', (len(emb),))[0])
            except Exception:
                try:
                    emb_len = len(emb)
                except Exception:
                    emb_len = -1
            try:
                emb_shape = getattr(embeddings, 'shape', 'none')
            except Exception:
                emb_shape = 'none'
            f.write(f"emb_len={emb_len} embeddings_shape={emb_shape}\n")
    except Exception:
        pass

    # Save image
    filename = f"{student_id}.jpg"
    path = os.path.join(IMAGES_DIR, filename)
    with open(path, 'wb') as f:
        f.write(content)

    # Update registry and embeddings
    _require_api_key(x_api_key)
    # prevent duplicate id
    for r in registry:
        if r.get('student_id') == student_id:
            return JSONResponse({"error": "student_id already exists"}, status_code=400)
    
    # Validate role
    if role not in ['student', 'teacher']:
        role = 'student'
    
    # Build person record
    person_record = {"student_id": student_id, "name": name, "role": role, "image": filename}
    
    # Optional contact/time fields
    if phone:
        person_record['phone'] = phone
    if principal_phone:
        person_record['principal_phone'] = principal_phone
    if time_in:
        person_record['time_in'] = time_in
    if time_out:
        person_record['time_out'] = time_out

    # Add hourly_rate for teachers
    if role == 'teacher':
        if hourly_rate is not None:
            person_record['hourly_rate'] = hourly_rate
        else:
            person_record['hourly_rate'] = 15.0  # Default hourly rate

    registry.append(person_record)
    if embeddings.size == 0:
        embeddings = emb.reshape(1, -1)
    else:
        embeddings = np.vstack([embeddings, emb.reshape(1, -1)])

    save_registry(registry, embeddings)
    logger.info(f"Enrolled student_id={student_id} name={name}")
    return {"status": "ok", "student_id": student_id}

@app.post("/recognize")
async def recognize(file: UploadFile = File(...), auto_clock: str = Form('false'), x_api_key: str = Header(None)):
    """Recognize the person in provided image. Returns best match and confidence.
    Optionally auto-clock teachers in/out based on current status.
    """
    content = await file.read()
    # Convert string to boolean
    auto_clock_enabled = auto_clock.lower() in ('true', '1', 'yes')
    try:
        emb = image_bytes_to_embedding(content)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if embeddings.size == 0:
        return {"match": None, "confidence": 0.0}

    _require_api_key(x_api_key)
    # Cosine similarity via dot product since vectors are normalized
    try:
        sims = embeddings.dot(emb)
    except Exception as e:
        logger.exception('Failed to compute similarity — possible embedding dimensionality mismatch')
        return JSONResponse({"error": "Embedding dimensionality mismatch between stored embeddings and the recognition model. Re-enroll persons or rebuild embeddings."}, status_code=500)
    best_idx = int(np.argmax(sims))
    best_sim = float(sims[best_idx])
    threshold = float(os.getenv('FACE_MATCH_THRESHOLD', FACE_MATCH_THRESHOLD))
    logger.info(f'Best match: idx={best_idx}, similarity={best_sim:.4f}, threshold={threshold:.4f}')
    if best_sim >= threshold:
        r = registry[best_idx]
        logger.info(f"✓ MATCH: {r.get('name')} (ID={r.get('student_id')}) score={best_sim:.4f}")
        # Log top 3 matches for debugging
        top3_idx = np.argsort(sims)[-3:][::-1]
        logger.info(f'Top 3: ' + ', '.join([f"{registry[i].get('name')}={sims[i]:.3f}" for i in top3_idx]))
        
        result = {"match": {"student_id": r.get('student_id'), "name": r.get('name'), "role": r.get('role', 'student')}, "confidence": best_sim}
        
        # Auto-clock for teachers if enabled
        if auto_clock_enabled and r.get('role') == 'teacher':
            from datetime import datetime
            attendance = load_attendance()
            student_id = r.get('student_id')
            now = datetime.now().isoformat()
            time_now = datetime.now()
            
            # Determine attendance status based on time (before 8 AM = present, 8 AM or later = late present)
            attendance_status = 'present' if time_now.hour < 8 else 'late present'
            
            # Check if already clocked in today
            today = datetime.now().date().isoformat()
            today_records = [a for a in attendance if a.get('student_id') == student_id and a.get('date') == today]
            
            if today_records and not today_records[-1].get('time_out'):
                # Clock out
                today_records[-1]['time_out'] = now
                save_attendance(attendance)
                result['attendance_action'] = 'clocked_out'
                result['time'] = now
                logger.info(f"⏰ CLOCK OUT: {r.get('name')} at {now}")
            else:
                # Clock in
                attendance.append({
                    'student_id': student_id,
                    'name': r.get('name'),
                    'role': 'teacher',
                    'date': today,
                    'time_in': now,
                    'time_out': None,
                    'status': attendance_status
                })
                save_attendance(attendance)
                result['attendance_action'] = 'clocked_in'
                result['time'] = now
                result['attendance_status'] = attendance_status
                logger.info(f"⏰ CLOCK IN: {r.get('name')} at {now} - Status: {attendance_status}")
        
        return result
    logger.warning(f'✗ NO MATCH: best score {best_sim:.4f} < threshold {threshold:.4f}')
    # Log closest matches for debugging
    top3_idx = np.argsort(sims)[-3:][::-1]
    logger.info(f'Closest 3: ' + ', '.join([f"{registry[i].get('name')}={sims[i]:.3f}" for i in top3_idx]))
    return {"match": None, "confidence": best_sim}

@app.get("/list")
def list_registry():
    return {"count": len(registry), "registry": registry}


@app.get('/persons')
def get_persons():
    return registry


@app.delete('/persons/{student_id}')
def delete_person(student_id: str, x_api_key: str = Header(None)):
    _require_api_key(x_api_key)
    global registry, embeddings
    idx = next((i for i,r in enumerate(registry) if r.get('student_id')==student_id), None)
    if idx is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    # remove image file
    imgname = registry[idx].get('image')
    try:
        p = os.path.join(IMAGES_DIR, imgname)
        if os.path.exists(p): os.remove(p)
    except Exception:
        logger.exception('Failed to remove image file')
    # remove from registry and embeddings
    registry.pop(idx)
    try:
        if embeddings.size == 0:
            embeddings = np.empty((0,))
        else:
            embeddings = np.delete(embeddings, idx, axis=0)
    except Exception:
        logger.exception('Failed to update embeddings')
    save_registry(registry, embeddings)
    logger.info(f'deleted person {student_id}')
    return {"status": "deleted"}


@app.put('/persons/{student_id}')
async def update_person(student_id: str, name: str = Form(None), new_student_id: str = Form(None), role: str = Form(None), hourly_rate: float = Form(None), phone: str = Form(None), principal_phone: str = Form(None), time_in: str = Form(None), time_out: str = Form(None), file: UploadFile = File(None), x_api_key: str = Header(None)):
    _require_api_key(x_api_key)
    global registry, embeddings
    idx = next((i for i,r in enumerate(registry) if r.get('student_id')==student_id), None)
    if idx is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    r = registry[idx]
    if name:
        r['name'] = name
    if new_student_id:
        r['student_id'] = new_student_id
    if role:
        if role not in ['student', 'teacher']:
            return JSONResponse({"error": "Invalid role. Must be 'student' or 'teacher'"}, status_code=400)
        r['role'] = role
        # If changing to teacher, ensure hourly_rate is set
        if role == 'teacher' and 'hourly_rate' not in r:
            r['hourly_rate'] = hourly_rate if hourly_rate else 15.0
    if hourly_rate is not None:
        if r.get('role') != 'teacher':
            return JSONResponse({"error": "Cannot set hourly_rate for non-teacher roles"}, status_code=400)
        r['hourly_rate'] = hourly_rate

    # Optional contact / default time updates
    if phone is not None:
        r['phone'] = phone
    if principal_phone is not None:
        r['principal_phone'] = principal_phone
    if time_in is not None:
        r['time_in'] = time_in
    if time_out is not None:
        r['time_out'] = time_out

    if file is not None:
        content = await file.read()
        filename = f"{r.get('student_id')}.jpg"
        path = os.path.join(IMAGES_DIR, filename)
        with open(path, 'wb') as f:
            f.write(content)
        r['image'] = filename
        try:
            emb = image_bytes_to_embedding(content)
            embeddings[idx] = emb
        except Exception:
            logger.exception('Failed to recompute embedding for updated image')
    registry[idx] = r
    save_registry(registry, embeddings)
    logger.info(f'updated person {r.get("student_id")} - role: {r.get("role")}')
    return {"status": "ok", "person": r}


@app.get('/images/{filename}')
def serve_image(filename: str):
    path = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail='not found')
    return FileResponse(path)

@app.post("/import-zip")
async def import_zip(file: UploadFile = File(...), x_api_key: str = Header(None)):
    """Import a ZIP containing a registry.json and images/ folder.
    registry.json should be a list of { student_id, name, image } where image is filename inside images/.
    """
    tmp = os.path.join(DATA_DIR, 'tmp_import')
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp, exist_ok=True)
    content = await file.read()
    zpath = os.path.join(tmp, 'upload.zip')
    with open(zpath, 'wb') as f:
        f.write(content)
    with zipfile.ZipFile(zpath, 'r') as z:
        z.extractall(tmp)

    reg_path = os.path.join(tmp, 'registry.json')
    images_path = os.path.join(tmp, 'images')
    if not os.path.exists(reg_path) or not os.path.exists(images_path):
        return JSONResponse({"error": "ZIP must contain registry.json and images/ folder"}, status_code=400)

    with open(reg_path, 'r', encoding='utf-8') as f:
        new_registry = json.load(f)

    new_embeddings = []
    new_images = []
    for entry in new_registry:
        imgname = entry.get('image')
        src = os.path.join(images_path, imgname)
        if not os.path.exists(src):
            return JSONResponse({"error": f"Missing image {imgname}"}, status_code=400)
        # copy image
        dst = os.path.join(IMAGES_DIR, imgname)
        shutil.copy(src, dst)
        with open(dst, 'rb') as f:
            data = f.read()
        emb = image_bytes_to_embedding(data)
        new_embeddings.append(emb)
        new_images.append(entry)

    _require_api_key(x_api_key)
    global registry, embeddings
    registry = new_images
    embeddings = np.vstack(new_embeddings) if len(new_embeddings) > 0 else np.empty((0, 64*64), dtype=np.float32)
    save_registry(registry, embeddings)
    shutil.rmtree(tmp)
    return {"status": "imported", "count": len(registry)}

@app.get("/export-zip")
def export_zip():
    # create temp zip
    tmpzip = os.path.join(DATA_DIR, 'export.zip')
    with zipfile.ZipFile(tmpzip, 'w') as z:
        # add registry
        if os.path.exists(REGISTRY_PATH):
            z.write(REGISTRY_PATH, arcname='registry.json')
        # add images
        for r in registry:
            img = r.get('image')
            p = os.path.join(IMAGES_DIR, img)
            if os.path.exists(p):
                z.write(p, arcname=os.path.join('images', img))
    return FileResponse(tmpzip, filename='dataset_export.zip')

# ============= Attendance & Payroll Endpoints =============

@app.post("/attendance/clock-in")
async def clock_in(student_id: str = Form(...), x_api_key: str = Header(None)):
    """Manual clock in for a teacher."""
    _require_api_key(x_api_key)
    from datetime import datetime
    
    # Find person
    person = next((r for r in registry if r.get('student_id') == student_id), None)
    if not person:
        return JSONResponse({"error": "Person not found"}, status_code=404)
    
    if person.get('role') != 'teacher':
        return JSONResponse({"error": "Only teachers can clock in"}, status_code=400)
    
    attendance = load_attendance()
    now = datetime.now().isoformat()
    today = datetime.now().date().isoformat()
    
    # Check if already clocked in
    today_records = [a for a in attendance if a.get('student_id') == student_id and a.get('date') == today]
    if today_records and not today_records[-1].get('time_out'):
        return JSONResponse({"error": "Already clocked in"}, status_code=400)
    
    attendance.append({
        'student_id': student_id,
        'name': person.get('name'),
        'role': 'teacher',
        'date': today,
        'time_in': now,
        'time_out': None
    })
    save_attendance(attendance)
    logger.info(f"⏰ MANUAL CLOCK IN: {person.get('name')} at {now}")
    return {"status": "clocked_in", "time": now, "person": person.get('name')}

@app.post("/attendance/clock-out")
async def clock_out(student_id: str = Form(...), x_api_key: str = Header(None)):
    """Manual clock out for a teacher."""
    _require_api_key(x_api_key)
    from datetime import datetime
    
    attendance = load_attendance()
    now = datetime.now().isoformat()
    today = datetime.now().date().isoformat()
    
    # Find today's active record
    today_records = [a for a in attendance if a.get('student_id') == student_id and a.get('date') == today and not a.get('time_out')]
    
    if not today_records:
        return JSONResponse({"error": "No active clock-in found"}, status_code=400)
    
    today_records[-1]['time_out'] = now
    save_attendance(attendance)
    logger.info(f"⏰ MANUAL CLOCK OUT: {today_records[-1].get('name')} at {now}")
    return {"status": "clocked_out", "time": now}

@app.get("/attendance")
def get_attendance(student_id: str = None, date: str = None, role: str = None):
    """Get attendance records. Optionally filter by student_id, date, or role."""
    attendance = load_attendance()
    
    if student_id:
        attendance = [a for a in attendance if a.get('student_id') == student_id]
    if date:
        attendance = [a for a in attendance if a.get('date') == date]
    if role:
        attendance = [a for a in attendance if a.get('role') == role]
    
    return {"count": len(attendance), "records": attendance}

@app.get("/payroll/{student_id}")
def get_payroll(student_id: str, start_date: str = None, end_date: str = None):
    """Calculate payroll for a teacher based on attendance records.
    Assumes hourly_rate is stored in registry or defaults to a standard rate.
    """
    from datetime import datetime, timedelta
    
    # Find person
    person = next((r for r in registry if r.get('student_id') == student_id), None)
    if not person:
        return JSONResponse({"error": "Person not found"}, status_code=404)
    
    if person.get('role') != 'teacher':
        return JSONResponse({"error": "Payroll only available for teachers"}, status_code=400)
    
    attendance = load_attendance()
    records = [a for a in attendance if a.get('student_id') == student_id]
    
    # Filter by date range if provided
    if start_date:
        records = [a for a in records if a.get('date', '') >= start_date]
    if end_date:
        records = [a for a in records if a.get('date', '') <= end_date]
    
    # Calculate total hours
    total_hours = 0
    total_days = 0
    complete_records = []
    
    for record in records:
        if record.get('time_in') and record.get('time_out'):
            try:
                time_in = datetime.fromisoformat(record['time_in'])
                time_out = datetime.fromisoformat(record['time_out'])
                duration = (time_out - time_in).total_seconds() / 3600  # hours
                total_hours += duration
                total_days += 1
                complete_records.append({
                    **record,
                    'hours_worked': round(duration, 2)
                })
            except Exception:
                pass
    
    # Get hourly rate (default $15/hour if not set)
    hourly_rate = float(person.get('hourly_rate', 15.0))
    total_salary = total_hours * hourly_rate
    
    return {
        "student_id": student_id,
        "name": person.get('name'),
        "role": "teacher",
        "hourly_rate": hourly_rate,
        "total_hours": round(total_hours, 2),
        "total_days": total_days,
        "total_salary": round(total_salary, 2),
        "currency": "USD",
        "period_start": start_date or "all_time",
        "period_end": end_date or "all_time",
        "records": complete_records
    }

@app.put("/persons/{student_id}/hourly-rate")
async def update_hourly_rate(student_id: str, hourly_rate: float = Form(...), x_api_key: str = Header(None)):
    """Update hourly rate for a teacher."""
    _require_api_key(x_api_key)
    global registry
    
    idx = next((i for i, r in enumerate(registry) if r.get('student_id') == student_id), None)
    if idx is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    
    if registry[idx].get('role') != 'teacher':
        return JSONResponse({"error": "Only teachers can have hourly rates"}, status_code=400)
    
    registry[idx]['hourly_rate'] = float(hourly_rate)
    save_registry(registry, embeddings)
    logger.info(f"Updated hourly rate for {registry[idx].get('name')}: ${hourly_rate}/hr")
    return {"status": "ok", "hourly_rate": hourly_rate}

if __name__ == '__main__':
    # Allow reload via env var, but avoid the "import string" requirement when running
    # the script directly. If reload is requested but the import string fails, fall
    # back to running without reload and log a clear message.
    reload_env = os.getenv('UVICORN_RELOAD', '0')
    use_reload = str(reload_env).lower() in ('1', 'true', 'yes')

    def _port_is_free(p: int) -> bool:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(('0.0.0.0', p))
            s.listen(1)
            return True
        except OSError:
            return False
        finally:
            try:
                s.close()
            except Exception:
                pass

    start_port = int(os.getenv('PORT', '8000'))
    max_tries = 10
    chosen_port = None
    for offset in range(max_tries):
        p = start_port + offset
        if _port_is_free(p):
            chosen_port = p
            break

    if chosen_port is None:
        logger.error(f'No free ports found in range {start_port}-{start_port+max_tries-1}; aborting')
        raise SystemExit(1)

    if chosen_port != start_port:
        logger.warning(f'Port {start_port} in use, selected free port {chosen_port} instead')

    # If reload requested, attempt to run with import string so uvicorn can reload properly.
    if use_reload:
        try:
            uvicorn.run('backend.app:app', host='0.0.0.0', port=chosen_port, reload=True)
        except ModuleNotFoundError:
            logger.warning("Requested reload but module import failed; running without reload.\n" \
                           "To enable reload, start with: `uvicorn backend.app:app --reload` from project root.")
            uvicorn.run(app, host='0.0.0.0', port=chosen_port, reload=False)
    else:
        uvicorn.run(app, host='0.0.0.0', port=chosen_port, reload=False)
