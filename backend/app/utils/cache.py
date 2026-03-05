"""
Simple in-memory cache for dashboard data with TTL
Reduces database load for frequently accessed data
"""
from datetime import datetime, timedelta
from typing import Any, Optional, Dict
import logging

logger = logging.getLogger(__name__)

class SimpleCache:
    """Thread-safe in-memory cache with TTL"""
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        if key in self._cache:
            entry = self._cache[key]
            if datetime.utcnow() < entry["expires_at"]:
                logger.debug(f"[CACHE HIT] {key}")
                return entry["value"]
            else:
                logger.debug(f"[CACHE EXPIRED] {key}")
                del self._cache[key]
        
        logger.debug(f"[CACHE MISS] {key}")
        return None
    
    def set(self, key: str, value: Any, ttl_seconds: int = 30):
        """Set cached value with TTL"""
        self._cache[key] = {
            "value": value,
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds),
            "cached_at": datetime.utcnow()
        }
        logger.debug(f"[CACHE SET] {key} (TTL: {ttl_seconds}s)")
    
    def invalidate(self, key: str):
        """Remove cached value"""
        if key in self._cache:
            del self._cache[key]
            logger.debug(f"[CACHE INVALIDATE] {key}")
    
    def clear(self):
        """Clear all cache"""
        self._cache.clear()
        logger.info("[CACHE] Cleared all entries")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = len(self._cache)
        expired = sum(1 for entry in self._cache.values() 
                     if datetime.utcnow() >= entry["expires_at"])
        return {
            "total_entries": total,
            "active_entries": total - expired,
            "expired_entries": expired
        }


# Global cache instance
dashboard_cache = SimpleCache()
