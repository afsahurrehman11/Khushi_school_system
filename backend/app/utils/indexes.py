"""Idempotent MongoDB index helpers used by startup and scripts.

This module centralizes index definitions and exposes a single
`ensure_performance_indexes(db)` function that is safe to call multiple
times (it uses `create_index`, which is idempotent).

It is imported by the CLI script and by the application startup so
indexes are created automatically when the backend starts.
"""
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)


def _student_indexes() -> List[Any]:
    return [
        ([("school_id", 1), ("status", 1)], {}),
        ([("school_id", 1)], {}),
        ([("student_id", 1)], {}),
        ([("class_id", 1)], {}),
        ([("registration_number", 1)], {}),
        # Face recognition indexes: speed up embedding cache loading
        ([("school_id", 1), ("embedding_status", 1)], {}),
        ([("school_id", 1), ("embedding_status", 1), ("face_embedding", 1)], {}),
    ]


def _attendance_indexes() -> List[Any]:
    return [
        ([("school_id", 1), ("date", -1)], {}),
        ([("school_id", 1), ("date", -1), ("status", 1)], {}),
        ([("student_id", 1), ("date", -1)], {}),
    ]


def _employee_attendance_indexes() -> List[Any]:
    return [
        ([("school_id", 1), ("date", -1)], {}),
        ([("school_id", 1), ("date", -1), ("status", 1)], {}),
        ([("teacher_id", 1), ("date", -1)], {}),
    ]


def _teachers_indexes() -> List[Any]:
    return [
        ([("school_id", 1)], {}),
        ([("teacher_id", 1)], {}),
        # Face recognition indexes: speed up embedding cache loading
        ([("school_id", 1), ("embedding_status", 1)], {}),
        ([("school_id", 1), ("embedding_status", 1), ("face_embedding", 1)], {}),
    ]


def _classes_indexes() -> List[Any]:
    return [
        ([("school_id", 1)], {}),
    ]


INDEX_MAP: Dict[str, List[Any]] = {
    "students": _student_indexes(),
    "attendance": _attendance_indexes(),
    "employee_attendance": _employee_attendance_indexes(),
    "teachers": _teachers_indexes(),
    "classes": _classes_indexes(),
}


def ensure_performance_indexes(db) -> None:
    """Create performance indexes for collections listed in INDEX_MAP.

    This function is safe to call multiple times and will not error if an
    index already exists; MongoDB's `create_index` is idempotent.
    """
    logger.info("🔧 Ensuring performance indexes for collections: %s", list(INDEX_MAP.keys()))

    for coll_name, indexes in INDEX_MAP.items():
        try:
            collection = db[coll_name]
            logger.info("\n📚 Ensuring indexes for collection: %s", coll_name)
            for spec, opts in indexes:
                # always create in background to avoid startup blocking
                opts = dict(opts)
                opts.setdefault("background", True)
                try:
                    idx_name = collection.create_index(spec, **opts)
                    logger.info("   ✅ Created/ensured index: %s -> %s", coll_name, idx_name)
                except Exception as ie:
                    logger.warning("   ⚠️ Failed to create index on %s for %s: %s", coll_name, spec, ie)
        except Exception as e:
            logger.warning("⚠️ Skipping indexes for %s: %s", coll_name, e)


def list_existing_indexes(db, collection_name: str):
    try:
        return list(db[collection_name].list_indexes())
    except Exception:
        return []
