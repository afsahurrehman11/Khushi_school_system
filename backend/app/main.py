# Fix Pydantic 1.x + Python 3.12 ForwardRef compatibility
# Pydantic v1 calls _evaluate(globalns, localns, set()) with 3 positional args.
# Python 3.12's ForwardRef._evaluate has signature: (self, globalns, localns, type_params=None, *, recursive_guard)
# The recursive_guard is keyword-only. This wrapper accepts Pydantic's 3-arg call and provides recursive_guard.
import typing
from typing import ForwardRef as _ForwardRef

if hasattr(_ForwardRef, "_evaluate"):
    _orig_forwardref_evaluate = _ForwardRef._evaluate

    def _compat_forwardref_evaluate(self, globalns=None, localns=None, type_params=None, **kwargs):
        # Pydantic v1 passes set() as the third positional arg (which becomes type_params).
        # Python 3.12 requires recursive_guard as a keyword-only argument.
        # If not provided in kwargs, use the type_params value (the set() from Pydantic).
        if 'recursive_guard' not in kwargs:
            kwargs['recursive_guard'] = type_params if type_params is not None else set()
        # Call the original implementation. Different Python versions have
        # different signatures for ForwardRef._evaluate():
        # - Py3.12+: (self, globalns, localns, type_params=None, *, recursive_guard)
        # - Py3.11 and earlier: (self, globalns, localns, recursive_guard)
        # Try the Py3.12-style call first and fall back to the older form on TypeError.
        try:
            return _orig_forwardref_evaluate(self, globalns=globalns, localns=localns,
                                             type_params=type_params, **kwargs)
        except TypeError:
            return _orig_forwardref_evaluate(self, globalns=globalns, localns=localns, **kwargs)

    _ForwardRef._evaluate = _compat_forwardref_evaluate

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import json
import sys
import asyncio
import httpx
from app.config import settings
from app.database import get_db
from app.startup import ensure_collections_exist
from app.routers import auth, users, students, fees, classes, teachers, grades, accounting, payments, reports, root, student_import_export, chalans, fee_categories, class_fee_assignments, notifications, fee_payments, accountant, payment_methods, schools, root_admin, cash_sessions, statistics, attendance, whatsapp, face
from app.routers import saas as saas_router
from app.routers import billing as billing_router
from app.routers import fee_vouchers as fee_vouchers_router
from app.routers import analytics as analytics_router
from app.services import face_service as _face_service_module
from app.middleware.database_routing import database_routing_middleware

# Configure logging (level configurable via LOG_LEVEL env var / settings.log_level)
log_level_str = getattr(settings, "log_level", "INFO")
try:
    log_level = getattr(logging, log_level_str.upper(), logging.INFO)
except Exception:
    log_level = logging.INFO

# Configure structured logging (JSON) or concise text depending on settings
def _make_formatter(fmt_type: str):
    if fmt_type == "json":
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                payload = {
                    "time": self.formatTime(record, "%H:%M:%S"),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                }
                # include exception info if present
                if record.exc_info:
                    payload["exc"] = self.formatException(record.exc_info)
                return json.dumps(payload, ensure_ascii=False)
        return JsonFormatter()

    # default text formatter (concise) with short time
    datefmt = "%H:%M:%S"
    # optional ANSI colors when LOG_COLORS env var is truthy
    use_colors = os.environ.get("LOG_COLORS", "false").lower() in ("1", "true", "yes")

    class ShortFormatter(logging.Formatter):
        def __init__(self, fmt=None, datefmt=None):
            super().__init__(fmt=fmt, datefmt=datefmt)

        def format(self, record: logging.LogRecord) -> str:
            # short time
            record.asctime = self.formatTime(record, datefmt)
            level = record.levelname
            msg = super().format(record)
            if use_colors:
                # simple color map
                colors = {
                    'DEBUG': '\u001b[36m',
                    'INFO': '\u001b[32m',
                    'WARNING': '\u001b[33m',
                    'ERROR': '\u001b[31m',
                    'CRITICAL': '\u001b[35m',
                }
                reset = '\u001b[0m'
                color = colors.get(level, '')
                return f"{color}{msg}{reset}"
            return msg

    fmt = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    return ShortFormatter(fmt=fmt, datefmt=datefmt)

root_logger = logging.getLogger()
root_logger.setLevel(log_level)
handler = logging.StreamHandler(stream=sys.stdout)
handler.setFormatter(_make_formatter(getattr(settings, "log_format", "text")))
# Replace default handlers with our single structured handler
root_logger.handlers = [handler]

# Make sure uvicorn loggers use the same handler/level
for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    lg = logging.getLogger(name)
    lg.handlers = [handler]
    lg.setLevel(log_level)
logger = logging.getLogger(__name__)

# Memory logging function
def log_memory():
    try:
        import psutil
        mem = psutil.virtual_memory()
        logger.info(f"Memory usage: {mem.percent}% used ({mem.used // (1024**2)}MB / {mem.total // (1024**2)}MB)")
    except ImportError:
        logger.info("psutil not installed, skipping memory log")

# Wrap entire application startup in try-except
try:
    logger.info("🚀 Starting Khushi ERP System API - Detailed Logging Enabled")
    log_memory()

    # Fixed numbers for testing logs
    fixed_number_1 = 42
    fixed_number_2 = 7
    logger.info(f"Fixed numbers initialized: {fixed_number_1}, {fixed_number_2}")

    # Small simulation function using fixed numbers
    def simulate_computation():
        result = fixed_number_1 * fixed_number_2 + (fixed_number_1 // fixed_number_2)
        logger.info(f"Simulation computation result: {result}")
        return result

    simulate_computation()

    # Import heavy libraries with detailed logging
    logger.info("📦 Importing heavy ML libraries...")

    try:
        import torch
        logger.info("✅ PyTorch imported successfully")
        log_memory()
    except Exception as e:
        logger.error(f"❌ PyTorch import failed: {e}")
        log_memory()

    try:
        import tensorflow as tf
        logger.info("✅ TensorFlow imported successfully")
        log_memory()
    except Exception as e:
        logger.error(f"❌ TensorFlow import failed: {e}")
        log_memory()

    try:
        import deepface
        logger.info("✅ DeepFace imported successfully")
        log_memory()
    except Exception as e:
        logger.error(f"❌ DeepFace import failed: {e}")
        log_memory()

    try:
        from facenet_pytorch import InceptionResnetV1
        logger.info("✅ FaceNet PyTorch imported successfully")
        log_memory()
    except Exception as e:
        logger.error(f"❌ FaceNet PyTorch import failed: {e}")
        log_memory()

    logger.info("✅ Heavy library imports completed")
    log_memory()

    # Initialize FastAPI app
    logger.info("🔧 Initializing FastAPI application...")
    app = FastAPI(
        title="Khushi ERP System API",
        description="School Enterprise Resource Planning System",
        version="1.0.0"
    )
    logger.info("✅ FastAPI app initialized successfully")

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("✅ CORS middleware added")

    # Add database routing middleware for multi-tenant support
    @app.middleware("http")
    async def db_routing_middleware(request, call_next):
        return await database_routing_middleware(request, call_next)
    logger.info("✅ Database routing middleware added")

    # Include routers with error handling
    logger.info("🔗 Including API routers...")
    try:
        app.include_router(auth, prefix="/api", tags=["Authentication"])
        app.include_router(saas_router, prefix="/api/saas", tags=["SaaS Management"])
        app.include_router(billing_router, prefix="/api/billing", tags=["Billing"])
        app.include_router(users, prefix="/api/admin", tags=["User Management"])
        app.include_router(students, prefix="/api", tags=["Students"])
        app.include_router(fees, prefix="/api", tags=["Fees"])
        app.include_router(classes, prefix="/api", tags=["Classes & Subjects"])
        app.include_router(teachers, prefix="/api", tags=["Teachers"])
        app.include_router(grades, prefix="/api", tags=["Grades"])
        app.include_router(accounting, prefix="/api", tags=["Accounting"])
        app.include_router(payments, tags=["Payments"])
        app.include_router(reports, prefix="/api", tags=["Reports"])
        app.include_router(root, prefix="/api/root", tags=["Root"])
        app.include_router(root_admin, prefix="/api/root", tags=["Root Admin Management"])
        app.include_router(schools, prefix="/api", tags=["Schools"])
        app.include_router(student_import_export, prefix="/api/students-import-export", tags=["Student Import/Export"])
        app.include_router(chalans, tags=["Chalans"])
        app.include_router(fee_categories, tags=["Fee Categories"])
        app.include_router(class_fee_assignments, tags=["Class Fee Assignments"])
        app.include_router(notifications, prefix="/api", tags=["Notifications"])
        app.include_router(fee_payments, tags=["Fee Payments"])
        app.include_router(accountant, tags=["Accountants"])
        app.include_router(payment_methods, tags=["Payment Methods"])
        app.include_router(cash_sessions, tags=["Cash Sessions"])
        app.include_router(statistics, tags=["Statistics"])
        app.include_router(attendance, prefix="/api", tags=["Attendance"])
        app.include_router(whatsapp, tags=["WhatsApp"])
        app.include_router(face, tags=["Face Recognition"])
        app.include_router(fee_vouchers_router, prefix="/api/fee-vouchers", tags=["Fee Vouchers"])
        app.include_router(analytics_router, prefix="/api/analytics", tags=["Analytics"])
        logger.info("✅ All routers included successfully")
    except Exception as e:
        logger.error(f"❌ Failed to include routers: {e}")
        raise

    log_memory()
    logger.info("🎉 Application initialization completed successfully")

except Exception as e:
    logger.critical(f"💥 APPLICATION CRASHED AT STARTUP: {e}")
    logger.critical(f"💥 Error type: {type(e).__name__}")
    import traceback
    logger.critical(f"💥 Full traceback:\n{traceback.format_exc()}")
    log_memory()
    logger.critical("💥 Exiting due to startup failure")
    sys.exit(1)


@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    logger.info("🚀 Starting Khushi ERP System API")
    db_connected = False
    try:
        # Attempt to get DB; this will try to connect lazily and may raise if unreachable
        db = get_db()
        # Test database connection
        db.command("ping")
        logger.info("✅ Database connection established")
        db_connected = True
    except Exception as e:
        logger.error(f"❌ Database connection failed (will continue without DB): {e}")

    if db_connected:
        try:
            result = ensure_collections_exist()
            created = result.get("created", [])
            if created:
                logger.info("✅ Collections created on startup: %s", created)
            else:
                logger.info("✅ All required collections already exist")
        except Exception as exc:
            logger.error(f"❌ Collections check/creation failed: {exc}")
        
        # Initialize SaaS root database and indexes
        try:
            from app.services.saas_db import get_saas_root_db
            saas_db = get_saas_root_db()
            
            # Create indexes for saas_root_db
            saas_db.schools.create_index("school_id", unique=True)
            saas_db.schools.create_index("admin_email", unique=True)
            saas_db.schools.create_index("database_name", unique=True)
            saas_db.schools.create_index("status")
            saas_db.usage_snapshots.create_index([("school_id", 1), ("date", -1)])
            saas_db.usage_snapshots.create_index("date")
            
            logger.info("✅ SaaS root database initialized with indexes")
        except Exception as e:
            logger.warning(f"⚠️ SaaS root database initialization: {e}")
        
        # Start SaaS background jobs (daily snapshots, cleanup)
        try:
            from app.services.saas_jobs import start_background_jobs
            await start_background_jobs()
            logger.info("✅ SaaS background jobs started")
        except Exception as e:
            logger.warning(f"⚠️ Failed to start SaaS background jobs: {e}")
            
    else:
        logger.warning("⚠️ Skipping collection creation because the database is not connected.")

    # Face recognition model & embedding cache: Skip in multi-tenant mode, load in single-tenant mode
    # In multi-tenant, face embeddings are loaded per-school on-demand
    if db_connected and getattr(settings, "database_name", None):
        try:
            # Single-tenant mode: try disk cache first, else load from DB and persist
            try:
                counts = _face_service_module.load_cache_from_disk()
                if (counts.get('students', 0) + counts.get('employees', 0)) > 0:
                    logger.info(f"✅ Face embeddings loaded from disk cache: {counts}")
                else:
                    # Load from DB per-school and then persist
                    try:
                        db = get_db()
                        schools = list(db.schools.find()) if 'schools' in db.list_collection_names() else []
                        if not schools:
                            sample = db.users.find_one({"school_id": {"$exists": True}})
                            if sample and sample.get('school_id'):
                                schools = [{'_id': sample.get('school_id')}]

                        for s in schools:
                            sid = str(s.get('_id'))
                            face_service = _face_service_module.FaceRecognitionService(db)
                            await face_service.load_embeddings_to_cache(sid)

                        # Persist to disk for faster future startups
                        saved = _face_service_module.dump_cache_to_disk()
                        logger.info(f"✅ Face embeddings cached to disk: {saved}")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to load embeddings from DB or persist cache: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Face cache disk load error: {e}")
        except Exception as e:
            # Importing or loading face services may fail if dependencies are missing; log and continue.
            logger.warning(f"⚠️ Skipping face cache load on startup: {e}")
    else:
        logger.info("ℹ️ Multi-tenant mode: Skipping face cache preload (loaded on-demand per school)")

    logger.info("✅ All routers registered successfully")
    logger.info(f"📡 API running on configured origins: {settings.allowed_origins}")

    # Start self-ping background task if enabled and URL provided
    try:
        if getattr(settings, "enable_self_ping", False) and settings.self_ping_url:
            stop_event = asyncio.Event()
            task = asyncio.create_task(_self_ping_loop(settings.self_ping_url, settings.self_ping_interval_minutes, stop_event))
            app.state.self_ping_task = task
            app.state.self_ping_stop_event = stop_event
            logger.info(f"🔁 Self-ping background task started (every {settings.self_ping_interval_minutes} minutes) -> {settings.self_ping_url}")
        else:
            logger.info("🔕 Self-ping disabled (no SELF_PING_URL or explicitly disabled)")
    except Exception as e:
        logger.warning(f"⚠️ Failed to start self-ping background task: {e}")


# --- Self-ping (keep-alive) background task ---------------------------------
async def _self_ping_loop(url: str, interval_minutes: int, stop_event: asyncio.Event) -> None:
    """Periodically ping the given `url` every `interval_minutes` minutes.

    Runs until `stop_event` is set. Logs success (status code) or failure.
    """
    interval_seconds = max(1, int(interval_minutes)) * 60
    client = httpx.AsyncClient(timeout=10.0)
    try:
        while not stop_event.is_set():
            try:
                resp = await client.get(url)
                # Avoid passing `extra` keys that conflict with LogRecord internals
                logger.info(f"SELF-PING: Ping {url} -> {resp.status_code}")
                logger.debug(f"SELF-PING response headers: {resp.headers}")
            except Exception as e:
                # Log warning instead of full stack trace for self-ping timeouts
                logger.warning(f"SELF-PING failed for {url}: {type(e).__name__}")

            # Wait for the interval or until stop_event is set
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                # timeout expired -> continue loop
                continue
    finally:
        await client.aclose()

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("🛑 Shutting down Khushi ERP System API")
    
    # Stop SaaS background jobs
    try:
        from app.services.saas_jobs import stop_background_jobs
        await stop_background_jobs()
        logger.info("🛑 SaaS background jobs stopped")
    except Exception as e:
        logger.warning(f"⚠️ Error stopping SaaS background jobs: {e}")
    
    # Stop self-ping task if running
    try:
        task = getattr(app.state, "self_ping_task", None)
        stop_event = getattr(app.state, "self_ping_stop_event", None)
        if task and stop_event:
            stop_event.set()
            try:
                await asyncio.wait_for(task, timeout=10.0)
            except asyncio.TimeoutError:
                task.cancel()
            logger.info("🔁 Self-ping background task stopped")
    except Exception as e:
        logger.warning(f"⚠️ Error stopping self-ping task: {e}")

@app.get("/")
async def root():
    """Root endpoint"""
    logger.info("📄 Root endpoint accessed")
    return {"message": "Khushi ERP System API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        db = get_db()
        # Test database connection
        db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}
