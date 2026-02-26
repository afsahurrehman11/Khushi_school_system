import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from dotenv import load_dotenv
import pathlib
import logging

# Load environment variables: prefer backend/.env, fall back to project root .env
logger = logging.getLogger(__name__)
BASE_DIR = pathlib.Path(__file__).resolve().parents[1]  # backend/
BACKEND_ENV = BASE_DIR / '.env'
ROOT_ENV = BASE_DIR.parent / '.env'

if BACKEND_ENV.exists():
    load_dotenv(dotenv_path=str(BACKEND_ENV))
    logger.debug(f"Loaded environment from {BACKEND_ENV}")
elif ROOT_ENV.exists():
    # Backwards compatibility: load root .env if backend/.env not present
    load_dotenv(dotenv_path=str(ROOT_ENV))
    logger.warning(f"Loaded environment from project root {ROOT_ENV}; consider moving secrets to backend/.env")
else:
    # No .env file found; rely on process environment variables (e.g., Render or CI)
    logger.debug("No .env file found for backend; using process environment variables")


def _db_name_from_uri(uri: str) -> Optional[str]:
    """Extract the database name from a mongodb URI if present.

    Examples:
      mongodb://host:27017/dbname -> dbname
      mongodb+srv://host/dbname?replicaSet=... -> dbname
    Returns None if no DB segment found.
    """
    if not uri:
        return None
    try:
        # strip scheme
        if "//" in uri:
            rest = uri.split("//", 1)[1]
        else:
            rest = uri
        # split on first slash after hosts
        if "/" in rest:
            after = rest.split("/", 1)[1]
            db = after.split("?", 1)[0]
            if db:
                return db
    except Exception:
        return None
    return None


class Settings(BaseSettings):
    # JWT Configuration
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # MongoDB Configuration
    mongo_uri: str = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    # Allow overriding the DB name via env; if not provided, derive from the
    # `MONGO_URI` path segment (common when the URI contains a database name),
    # otherwise fall back to the historical default `cms_db`.
    database_name: Optional[str] = None

    # CORS Configuration
    allowed_origins: list = ["*"]
    # Logging
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    # Control whether index creation runs on startup (use 'false' to skip)
    create_indexes: bool = os.environ.get("CREATE_INDEXES", "true").lower() in ("1", "true", "yes")
    # Control whether to seed test data (teachers) on startup - NEVER enable in production
    seed_test_data: bool = os.environ.get("SEED_TEST_DATA", "false").lower() in ("1", "true", "yes")
    # Log output format: 'text' or 'json'
    log_format: str = os.environ.get("LOG_FORMAT", "text")
    # Whether to show HTTP access logs from Uvicorn
    access_log: bool = os.environ.get("LOG_ACCESS", "true").lower() in ("1", "true", "yes")
    
    # Face Recognition App Configuration
    face_recognition_url: str = os.environ.get("FACE_RECOGNITION_URL", "http://localhost:5000")
    face_recognition_api_key: Optional[str] = os.environ.get("FACE_RECOGNITION_API_KEY", None)
    face_recognition_enabled: bool = os.environ.get("FACE_RECOGNITION_ENABLED", "true").lower() in ("1", "true", "yes")
    # Skip ML model loading on startup - models will load lazily on first use
    # Set to 'true' in production to avoid blocking server startup
    skip_ml_on_startup: bool = os.environ.get("SKIP_ML_ON_STARTUP", "true").lower() in ("1", "true", "yes")

    # Cloudinary Configuration
    cloudinary_cloud_name: str = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    cloudinary_api_key: str = os.environ.get("CLOUDINARY_API_KEY", "")
    cloudinary_api_secret: str = os.environ.get("CLOUDINARY_API_SECRET", "")
    
    # School Configuration
    school_name: str = os.environ.get("SCHOOL_NAME", "school")
    
    # WhatsApp Cloud API Configuration
    # Get these from Meta Business Suite > WhatsApp > API Setup
    whatsapp_api_key: str = os.environ.get("WHATSAPP_API_KEY", "")
    whatsapp_phone_number_id: str = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    whatsapp_business_account_id: str = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")

    # Self-ping (keep-alive) configuration
    # Hard-coded deployed URL for self-ping. This value is used when no
    # environment variable is provided and enables the self-ping task.
    # Replace with your deployed URL if different.
    self_ping_url: Optional[str] = os.environ.get("SELF_PING_URL", "https://khushi-school-system.onrender.com")
    # Interval in minutes between pings (default 57)
    self_ping_interval_minutes: int = int(os.environ.get("SELF_PING_INTERVAL_MINUTES", 57))
    # Whether to enable the self-ping background task. Disabled by default
    # for production deployments on platforms like Render that handle keep-alive automatically.
    enable_self_ping: bool = os.environ.get("ENABLE_SELF_PING", "false").lower() in ("1", "true", "yes")

    class Config:
        env_file = ".env"

settings = Settings()

# DISABLE automatic database name derivation from MONGO_URI
# This prevents automatic creation of databases named in the URI path
# Only use explicit DATABASE_NAME environment variable or leave unset for multi-tenant mode
# if not settings.database_name:
#     parsed = _db_name_from_uri(settings.mongo_uri)
#     settings.database_name = parsed or None

# Keep database_name as None unless explicitly set via DATABASE_NAME env var
# This prevents automatic database creation from URI path segments
