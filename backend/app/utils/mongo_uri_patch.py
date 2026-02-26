"""
MongoDB URI Patching Utility
Automatically detects and fixes MongoDB URI encoding issues
"""

import logging
import re
from urllib.parse import urlparse, urlunparse, quote_plus
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


def parse_mongo_uri(uri: str) -> Tuple[Optional[str], Optional[str], str]:
    """
    Parse MongoDB URI to extract username, password, and base URI.

    Returns:
        Tuple of (username, password, base_uri)
    """
    try:
        parsed = urlparse(uri)

        # Extract username and password
        username = parsed.username
        password = parsed.password

        # Remove credentials from netloc to get base URI
        netloc_parts = parsed.netloc.split('@')
        if len(netloc_parts) > 1:
            # Has credentials, remove them
            base_netloc = netloc_parts[-1]  # Last part after @
        else:
            # No credentials
            base_netloc = parsed.netloc

        # Reconstruct base URI without credentials
        base_uri = urlunparse((
            parsed.scheme,
            base_netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment
        ))

        return username, password, base_uri

    except Exception as e:
        logger.warning(f"Failed to parse MongoDB URI: {e}")
        return None, None, uri


def needs_encoding(text: str) -> bool:
    """
    Check if a string contains characters that need URL encoding.
    """
    if not text:
        return False

    # Characters that need encoding in URLs (RFC 3986)
    # This is a conservative check - any non-alphanumeric character except -._~
    return bool(re.search(r'[^a-zA-Z0-9\-._~]', text))


def encode_mongo_credentials(username: Optional[str], password: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Encode username and password if they contain special characters.
    """
    encoded_username = quote_plus(username) if username and needs_encoding(username) else username
    encoded_password = quote_plus(password) if password and needs_encoding(password) else password

    return encoded_username, encoded_password


def reconstruct_mongo_uri(base_uri: str, username: Optional[str], password: Optional[str]) -> str:
    """
    Reconstruct MongoDB URI with encoded credentials.
    """
    try:
        parsed = urlparse(base_uri)

        # Build netloc with credentials
        netloc = ""
        if username:
            netloc += username
            if password:
                netloc += f":{password}"
            netloc += "@"
        netloc += parsed.netloc

        # Reconstruct full URI
        return urlunparse((
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment
        ))

    except Exception as e:
        logger.warning(f"Failed to reconstruct MongoDB URI: {e}")
        return base_uri


def patch_mongo_uri(uri: str) -> str:
    """
    Automatically patch MongoDB URI by encoding username and password.

    Args:
        uri: The original MongoDB URI

    Returns:
        Patched URI with encoded credentials, or original URI if no patching needed
    """
    try:
        # TEMPORARILY DISABLED - URI should already be properly encoded
        # If the URI is already encoded (contains %XX patterns), don't re-encode
        if '%40' in uri or '%2A' in uri or '%2a' in uri:
            logger.info("✅ MongoDB URI already contains encoded characters - skipping patch")
            return uri
        
        # Parse the URI
        username, password, base_uri = parse_mongo_uri(uri)

        # Check if encoding is needed
        if not username or (not needs_encoding(username) and not (password and needs_encoding(password))):
            logger.debug("MongoDB URI does not need encoding")
            return uri

        # Encode credentials
        encoded_username, encoded_password = encode_mongo_credentials(username, password)

        # Reconstruct URI
        patched_uri = reconstruct_mongo_uri(base_uri, encoded_username, encoded_password)

        logger.info("✅ MongoDB URI patch applied successfully")
        logger.debug(f"Original URI: {uri.replace(password or '', '***') if password else uri}")
        logger.debug(f"Patched URI: {patched_uri.replace(encoded_password or '', '***') if encoded_password else patched_uri}")

        return patched_uri

    except Exception as e:
        logger.warning(f"Failed to patch MongoDB URI: {e}")
        return uri


def test_mongo_connection(uri: str) -> bool:
    """
    Test MongoDB connection with the given URI.

    Returns:
        True if connection successful, False otherwise
    """
    try:
        from pymongo import MongoClient
        from pymongo.errors import InvalidURI

        # Try to create client - this will raise InvalidURI if encoding is wrong
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        client.close()
        return True

    except InvalidURI as e:
        if "Username and password must be escaped according to RFC 3986" in str(e):
            logger.info("Detected MongoDB URI encoding issue, attempting to patch...")
            return False
        else:
            logger.error(f"MongoDB URI validation failed: {e}")
            return False

    except Exception as e:
        logger.warning(f"MongoDB connection test failed: {e}")
        return False


def auto_patch_and_test(uri: str) -> Tuple[str, bool]:
    """
    Automatically patch MongoDB URI if needed and test connection.

    Returns:
        Tuple of (patched_uri, connection_successful)
    """
    # First test with original URI
    if test_mongo_connection(uri):
        return uri, True

    # If failed, try patching
    patched_uri = patch_mongo_uri(uri)

    # Test with patched URI
    if patched_uri != uri and test_mongo_connection(patched_uri):
        return patched_uri, True

    return uri, False