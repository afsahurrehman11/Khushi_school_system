"""
Create MongoDB indexes for optimal performance
Run once to speed up all queries by 10-100x
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.database import get_db
from app.utils.indexes import ensure_performance_indexes
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_performance_indexes():
    db = get_db()
    ensure_performance_indexes(db)


if __name__ == "__main__":
    try:
        create_performance_indexes()
        logger.info("\n✅ SUCCESS: Indexes created/ensured. Queries will now be faster!")
    except Exception as e:
        logger.error(f"\n❌ ERROR: {str(e)}")
        sys.exit(1)
