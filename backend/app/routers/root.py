from fastapi import APIRouter, Depends
from app.dependencies.auth import get_current_root
from app.database import get_db

router = APIRouter()

@router.get("/stats")
async def root_stats(current_user: dict = Depends(get_current_root)):
    db = get_db()
    # Count admins
    admin_count = db.users.count_documents({"role": "Admin"})
    # If a 'schools' collection exists, count it; otherwise return 1 as default
    try:
        schools_count = db.schools.count_documents({})
    except Exception:
        schools_count = 1

    return {"admins": admin_count, "schools": schools_count}
