"""
Middleware Package
"""

from app.middleware.database_routing import (
    database_routing_middleware,
    get_current_database_name,
    get_current_school_id,
    get_db_for_request,
    extract_school_context,
    verify_school_access,
    SchoolDatabaseDependency,
    require_school_context,
    school_isolation_check,
    create_school_token_data,
)

__all__ = [
    'database_routing_middleware',
    'get_current_database_name',
    'get_current_school_id',
    'get_db_for_request',
    'extract_school_context',
    'verify_school_access',
    'SchoolDatabaseDependency',
    'require_school_context',
    'school_isolation_check',
    'create_school_token_data',
]
