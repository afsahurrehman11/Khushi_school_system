"""Compatibility shim for scripts that import `database`.

This re-exports `get_db` and `close_db` from `app.database` so
existing one-off scripts (`db_bootstrap.py`, `seed_dummy_data.py`) can
import `database` as a top-level module when run from the `backend` folder.
"""
from app.database import get_db, close_db  # re-export

__all__ = ["get_db", "close_db"]
