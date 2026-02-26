from pymongo import MongoClient
from pymongo.errors import ConfigurationError
import logging
import time
import os
import re
import traceback
from app.config import settings
from app.utils.mongo_uri_patch import patch_mongo_uri, test_mongo_connection

logger = logging.getLogger(__name__)

# Lazy client initialization to avoid hard crashes on import when DNS/SRV fails.
client = None

def _log_error(message: str, exc: Exception = None):
    """Helper to log errors with full traceback"""
    logger.error(f"\u274c {message}")
    if exc:
        logger.error(f"   Error type: {type(exc).__name__}")
        logger.error(f"   Error message: {str(exc)}")
        logger.error(f"   Traceback:\n{traceback.format_exc()}")

def _mask_uri(uri: str) -> str:
    """Mask password in URI for logging"""
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', uri)

def _create_client(uri: str) -> MongoClient:
    """Create MongoDB client with comprehensive error handling"""
    try:
        # Decide TLS usage from the URI:
        # - If it's an SRV URI (mongodb+srv://) enable TLS by default.
        # - Otherwise, respect explicit query params `tls=true` or `ssl=true` if present.
        from urllib.parse import urlparse, parse_qs

        uri_lower = uri.lower() if isinstance(uri, str) else ""
        is_srv = uri_lower.startswith("mongodb+srv://")
        use_tls = is_srv

        try:
            parsed = urlparse(uri)
            qs = parse_qs(parsed.query)
            if 'tls' in qs:
                v = qs['tls'][0].lower()
                use_tls = v in ('1', 'true', 'yes', 'on')
            elif 'ssl' in qs:
                v = qs['ssl'][0].lower()
                use_tls = v in ('1', 'true', 'yes', 'on')
        except Exception as parse_exc:
            logger.warning(f"⚠️  Failed to parse URI query parameters: {parse_exc}")
            # Fall back to SRV-based decision

        # Only pass TLS-specific kwargs when TLS is enabled. Passing
        # tlsAllowInvalidCertificates (even False) to PyMongo without tls=True
        # causes a ConfigurationError, so construct kwargs conditionally.
        kwargs = {
            'serverSelectionTimeoutMS': 30000,
            'connectTimeoutMS': 30000,
            'socketTimeoutMS': 30000,
        }

        if use_tls:
            kwargs['tls'] = True
            kwargs['tlsAllowInvalidCertificates'] = True

        logger.debug(f"Creating MongoDB client with TLS={use_tls}...")
        return MongoClient(uri, **kwargs)
    
    except Exception as exc:
        _log_error(f"Failed to create MongoClient: {str(exc)}", exc)
        raise

def ensure_client_connected(retries: int = 3, delay: float = 2.0):
    """Ensure a MongoClient is available and connected.

    Tries a few times and logs actionable messages on SRV/DNS failures. If a
    fallback URI is provided via `FALLBACK_MONGO_URI` env var, it will be used.
    
    Returns None if connection fails - caller should handle gracefully.
    """
    global client
    if client is not None:
        return client

    try:
        # Validate MONGO_URI is set
        uri = settings.mongo_uri
        if not uri:
            _log_error("MONGO_URI environment variable is not set! Must be configured in backend/.env")
            return None
        
        logger.info(f"📡 Database connection string loaded from backend/.env")
        masked_uri = _mask_uri(uri)
        logger.info(f"   Using URI: {masked_uri}")

        # Allow explicit fallback via env var for environments with DNS issues
        fallback = os.environ.get("FALLBACK_MONGO_URI")
        attempts = 0
        last_exc = None

        while attempts < retries:
            try:
                logger.info(f"🔄 MongoDB connection attempt {attempts + 1}/{retries}...")
                # Auto-patch URI if it contains unescaped credentials
                try:
                    patched_uri = patch_mongo_uri(uri)
                except Exception as patch_exc:
                    logger.warning(f"⚠️  Failed to patch MONGO_URI: {patch_exc}")
                    patched_uri = uri
                
                client = _create_client(patched_uri)
                # Trigger server selection to verify connectivity
                try:
                    client.admin.command("ping")
                except Exception as ping_exc:
                    _log_error(f"Ping command failed: {ping_exc}", ping_exc)
                    client = None
                    raise
                
                logger.info("✅ MongoDB connection: SUCCESS")
                return client
            
            except ConfigurationError as exc:
                last_exc = exc
                logger.warning(f"⚠️  Configuration error: {exc}")
                # If this looks like an SRV/DNS timeout and a fallback is configured, try it
                if fallback:
                    logger.info("📌 Trying fallback MongoDB URI from FALLBACK_MONGO_URI...")
                    uri = fallback
                else:
                    # If SRV was used and no fallback provided, break to avoid pointless retries
                    if isinstance(settings.mongo_uri, str) and settings.mongo_uri.lower().startswith("mongodb+srv://"):
                        logger.error(
                            "❌ DNS SRV resolution failed for mongodb+srv URI. "
                            "Provide a non-SRV connection string or set FALLBACK_MONGO_URI."
                        )
                        break
            
            except Exception as exc:
                last_exc = exc
                _log_error(f"Connection attempt {attempts + 1} failed", exc)

            attempts += 1
            if attempts < retries:
                wait_time = delay * attempts
                logger.info(f"⏳ Retrying in {wait_time}s...")
                time.sleep(wait_time)

        # Final attempt using original URI if we haven't tried fallback
        try:
            if client is None and attempts >= retries:
                logger.info("Final connection attempt...")
                try:
                    patched_uri = patch_mongo_uri(uri)
                except Exception as patch_exc:
                    logger.warning(f"⚠️  Failed to patch MONGO_URI on final attempt: {patch_exc}")
                    patched_uri = uri
                
                client = _create_client(patched_uri)
                client.admin.command("ping")
                logger.info("✅ MongoDB connection: SUCCESS (final attempt)")
                return client
        except Exception as exc:
            last_exc = exc
            _log_error("Final connection attempt failed", exc)

        logger.error(f"❌ Could not connect to MongoDB after {attempts} attempts")
        logger.error(f"   Last error: {last_exc}")
        client = None
        return None
    
    except Exception as exc:
        _log_error("Unexpected error in ensure_client_connected", exc)
        return None


def get_db():
    """Get database instance with comprehensive error handling.
    
    Will attempt to connect lazily and log errors gracefully if it cannot.
    In multi-tenant mode (no DATABASE_NAME), returns saas_root_db as fallback.
    School-specific databases are accessed via middleware context.
    
    Returns None if connection fails - caller should handle gracefully.
    """
    try:
        c = ensure_client_connected()
        if c is None:
            _log_error("Database is not connected. Check MONGO_URI in backend/.env and network/DNS settings.")
            return None
        
        # Check if we have school-specific database context
        try:
            from app.middleware.database_routing import get_current_database_name
            db_name = get_current_database_name()
            if db_name:
                logger.debug(f"Using school-specific database: {db_name}")
                return c[db_name]
        except Exception as context_exc:
            logger.debug(f"⚠️  Could not get database context: {context_exc}")
            # If context is not available or middleware not loaded, fall back to default
            pass
        
        # Multi-tenant mode: Return saas_root_db when no DATABASE_NAME configured
        # This allows startup code to work without requiring a default school database
        if not getattr(settings, "database_name", None):
            logger.debug("📊 Multi-tenant mode: Using saas_root_db as default database")
            from app.services.saas_db import SAAS_ROOT_DB_NAME
            return c[SAAS_ROOT_DB_NAME]

        logger.debug(f"Using configured database: {settings.database_name}")
        return c[settings.database_name]
    
    except Exception as exc:
        _log_error(f"Failed to get database instance", exc)
        return None

def close_db():
    """Close database connection if present - with comprehensive error handling"""
    global client
    if client is not None:
        try:
            logger.info("📍 Closing MongoDB connection...")
            client.close()
            logger.info("✅ MongoDB connection closed")
        except Exception as exc:
            _log_error("Error while closing database connection", exc)
            # Don't raise - just log and continue
        finally:
            client = None
