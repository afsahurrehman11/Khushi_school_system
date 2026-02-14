from pymongo import MongoClient
from pymongo.errors import ConfigurationError
import logging
import ssl
from app.config import settings

logger = logging.getLogger(__name__)

def _create_client(uri: str) -> MongoClient:
    return MongoClient(
        uri,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
        tls=True,
        tlsAllowInvalidCertificates=True
    )

try:
    client = _create_client(settings.mongo_uri)
except ConfigurationError as exc:
    # Helpful message for SRV/DNS resolution failures (common with mongodb+srv)
    logger.error("Failed to create MongoClient using URI %s: %s", settings.mongo_uri, exc)
    raise

database = client[settings.database_name]

def get_db():
    """Get database instance"""
    return database

def close_db():
    """Close database connection"""
    client.close()
