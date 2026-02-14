from typing import Optional
from app.services.user import get_role_by_name

def role_has_permission(role_name: Optional[str], permission: str) -> bool:
    """Return True if the role contains the given permission."""
    if not role_name:
        return False
    role = get_role_by_name(role_name)
    if not role:
        return False
    return permission in role.get("permissions", [])
