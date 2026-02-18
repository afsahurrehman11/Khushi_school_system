from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.models.school import SchoolSchema, SchoolInDB, SchoolUpdate, SchoolResponse
from app.services.school import (
    create_school, get_school, get_all_schools, get_school_by_name, 
    update_school, delete_school
)
from app.dependencies.auth import get_current_root, get_current_admin_with_school
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ================= School Management (Root Only) =================

@router.post("/schools", response_model=SchoolInDB, tags=["Schools"])
async def create_new_school(
    school: SchoolSchema,
    current_user: dict = Depends(get_current_root)
):
    """Create a new school (Root only)"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Creating school: {school.display_name}")
        new_school = create_school(school)
        return new_school
    except ValueError as e:
        logger.warning(f"[ROOT:{current_user.get('email')}] School creation failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to create school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools", response_model=List[SchoolResponse], tags=["Schools"])
async def get_schools(
    is_active: bool = None,
    current_user: dict = Depends(get_current_root)
):
    """Get all schools (Root only)"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Fetching schools")
        schools = get_all_schools(is_active=is_active)
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ Retrieved {len(schools)} schools")
        return schools
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to fetch schools: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools/{school_id}", response_model=SchoolInDB, tags=["Schools"])
async def get_school_by_id(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Get school by ID (Root only)"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Fetching school: {school_id}")
        school = get_school(school_id)
        if not school:
            logger.warning(f"[ROOT:{current_user.get('email')}] School not found: {school_id}")
            raise HTTPException(status_code=404, detail="School not found")
        return school
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to fetch school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/schools/{school_id}", response_model=SchoolInDB, tags=["Schools"])
async def update_school_info(
    school_id: str,
    school_update: SchoolUpdate,
    current_user: dict = Depends(get_current_root)
):
    """Update school information (Root only)"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Updating school: {school_id}")
        updated_school = update_school(school_id, school_update)
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ School updated: {school_id}")
        return updated_school
    except ValueError as e:
        logger.warning(f"[ROOT:{current_user.get('email')}] Update failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to update school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/schools/{school_id}", tags=["Schools"])
async def deactivate_school(
    school_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Deactivate school (Root only)"""
    try:
        logger.info(f"[ROOT:{current_user.get('email')}] Deactivating school: {school_id}")
        success = delete_school(school_id)
        if not success:
            raise HTTPException(status_code=404, detail="School not found")
        logger.info(f"[ROOT:{current_user.get('email')}] ✅ School deactivated: {school_id}")
        return {"message": "School deactivated successfully"}
    except Exception as e:
        logger.error(f"[ROOT:{current_user.get('email')}] ❌ Failed to deactivate school: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schools/info/current", response_model=SchoolResponse, tags=["Schools"])
async def get_current_admin_school(
    current_user: dict = Depends(get_current_admin_with_school)
):
    """Get current admin's school information (Admin only)"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id}] [ADMIN:{current_user.get('email')}] Fetching school info")
        school = get_school(school_id)
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ School info retrieved")
        return school
    except Exception as e:
        school_id = current_user.get("school_id")
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch school info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
