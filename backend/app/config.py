import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from dotenv import load_dotenv

load_dotenv()


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
    # Log output format: 'text' or 'json'
    log_format: str = os.environ.get("LOG_FORMAT", "text")
    # Whether to show HTTP access logs from Uvicorn
    access_log: bool = os.environ.get("LOG_ACCESS", "true").lower() in ("1", "true", "yes")

    # Cloudinary Configuration
    cloudinary_cloud_name: str = os.environ.get("CLOUDINARY_CLOUD_NAME", "diddrewkq")
    cloudinary_api_key: str = os.environ.get("CLOUDINARY_API_KEY", "873389445629329")
    cloudinary_api_secret: str = os.environ.get("CLOUDINARY_API_SECRET", "F3yS5EVT5MMp09_ZyR0sbYBocjQ")
    
    # School Configuration
    school_name: str = os.environ.get("SCHOOL_NAME", "school")
    
    # WhatsApp Cloud API Configuration
    # Get these from Meta Business Suite > WhatsApp > API Setup
    whatsapp_api_key: str = os.environ.get("WHATSAPP_API_KEY", "")
    whatsapp_phone_number_id: str = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    whatsapp_business_account_id: str = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")

    class Config:
        env_file = ".env"

settings = Settings()

# Ensure `settings.database_name` is set. Prefer explicit setting, then URI
# path, then hard-coded default to preserve existing behavior.
if not settings.database_name:
    parsed = _db_name_from_uri(settings.mongo_uri)
    settings.database_name = parsed or "cms_db"
