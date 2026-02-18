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
        
        return _orig_forwardref_evaluate(self, globalns=globalns, localns=localns, 
                                         type_params=type_params, **kwargs)

    _ForwardRef._evaluate = _compat_forwardref_evaluate

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import json
import sys
from app.config import settings
from app.database import get_db
from app.startup import ensure_collections_exist
from app.routers import auth, users, students, fees, classes, teachers, grades, accounting, payments, reports, root, student_import_export, chalans, fee_categories, class_fee_assignments, notifications, fee_payments, accountant, payment_methods, schools, root_admin, cash_sessions, statistics, attendance

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

# Initialize FastAPI app
app = FastAPI(
    title="Khushi ERP System API",
    description="School Enterprise Resource Planning System",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth, prefix="/api", tags=["Authentication"])
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
    else:
        logger.warning("⚠️ Skipping collection creation because the database is not connected.")

    logger.info("✅ All routers registered successfully")
    logger.info(f"📡 API running on configured origins: {settings.allowed_origins}")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("🛑 Shutting down Khushi ERP System API")

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
