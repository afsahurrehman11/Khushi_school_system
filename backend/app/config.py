import os
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # JWT Configuration
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # MongoDB Configuration
    mongo_uri: str = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    database_name: str = "cms_db"

    # CORS Configuration
    allowed_origins: list = ["*"]

    class Config:
        env_file = ".env"

settings = Settings()
