from pymongo import MongoClient
from pymongo.errors import ConfigurationError
import logging
import time
import os
from app.config import settings
from app.utils.mongo_uri_patch import patch_mongo_uri, test_mongo_connection

logger = logging.getLogger(__name__)

# Lazy client initialization to avoid hard crashes on import when DNS/SRV fails.
client = None

def _create_client(uri: str) -> MongoClient:
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
    except Exception:
        # If parsing fails, fall back to SRV-based decision
        pass

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

    return MongoClient(uri, **kwargs)

def ensure_client_connected(retries: int = 3, delay: float = 2.0):
    """Ensure a MongoClient is available and connected.

    Tries a few times and logs actionable messages on SRV/DNS failures. If a
    fallback URI is provided via `FALLBACK_MONGO_URI` env var, it will be used.
    """
    global client
    if client is not None:
        return client

    uri = settings.mongo_uri

    # Allow explicit fallback via env var for environments with DNS issues
    fallback = os.environ.get("FALLBACK_MONGO_URI")
    attempts = 0
    last_exc = None

    while attempts < retries:
        try:
            logger.info("Attempting to create MongoClient (attempt %d) for URI: %s", attempts + 1, uri)
            # Auto-patch URI if it contains unescaped credentials
            patched_uri = patch_mongo_uri(uri)
            client = _create_client(patched_uri)
            # Trigger server selection to verify connectivity
            client.admin.command("ping")
            logger.info("✅ MongoClient connected successfully")
            return client
        except ConfigurationError as exc:
            last_exc = exc
            logger.warning("MongoClient configuration error: %s", exc)
            # If this looks like an SRV/DNS timeout and a fallback is configured, try it
            if fallback:
                logger.info("Trying fallback Mongo URI from FALLBACK_MONGO_URI")
                uri = fallback
            else:
                # If SRV was used and no fallback provided, break to avoid pointless retries
                if isinstance(settings.mongo_uri, str) and settings.mongo_uri.lower().startswith("mongodb+srv://"):
                    logger.error(
                        "DNS SRV resolution failed for mongodb+srv URI."
                        " Provide a non-SRV connection string or set FALLBACK_MONGO_URI to a mongodb:// URI."
                    )
                    break
        except Exception as exc:
            last_exc = exc
            logger.warning("MongoClient connection attempt failed: %s", exc)

        attempts += 1
        time.sleep(delay * attempts)

    # Final attempt using original URI if we haven't tried fallback
    try:
        if client is None:
            logger.info("Final attempt to create MongoClient for URI: %s", uri)
            patched_uri = patch_mongo_uri(uri)
            client = _create_client(patched_uri)
            client.admin.command("ping")
            logger.info("✅ MongoClient connected successfully (final attempt)")
            return client
    except Exception as exc:
        last_exc = exc

    logger.error("❌ Could not connect to MongoDB after %d attempts: %s", attempts, last_exc)
    client = None
    return None

def get_db():
    """Get database instance. Will attempt to connect lazily and raise if it cannot.
    
    In multi-tenant mode (no DATABASE_NAME), returns saas_root_db as fallback.
    School-specific databases are accessed via middleware context.
    """
    c = ensure_client_connected()
    if c is None:
        raise RuntimeError("Database is not connected. Check MONGO_URI or FALLBACK_MONGO_URI and network/DNS settings.")
    
    # Check if we have school-specific database context
    try:
        from app.middleware.database_routing import get_current_database_name
        db_name = get_current_database_name()
        if db_name:
            return c[db_name]
    except Exception:
        # If context is not available or middleware not loaded, fall back to default
        pass
    
    # Multi-tenant mode: Return saas_root_db when no DATABASE_NAME configured
    # This allows startup code to work without requiring a default school database
    if not getattr(settings, "database_name", None):
        logger.debug("Multi-tenant mode: Using saas_root_db as fallback database")
        from app.services.saas_db import SAAS_ROOT_DB_NAME
        return c[SAAS_ROOT_DB_NAME]

    return c[settings.database_name]

def close_db():
    """Close database connection if present"""
    global client
    if client is not None:
        try:
            client.close()
        except Exception:
            pass
        client = None
