from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.models.school import SchoolSchema, SchoolInDB, SchoolUpdate, SchoolResponse
from app.services.school import (
    create_school, get_school, get_all_schools, get_school_by_name, 
    update_school, delete_school
)
from app.dependencies.auth import get_current_root, get_current_admin_with_school
from app.services.saas_db import get_school_by_id
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
async def get_school_by_id_root(
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
        # Use SaaS root lookup which supports both school_id (custom id) and ObjectId
        # `get_school_by_id` is synchronous and returns a dict or None
        try:
            school = get_school_by_id(school_id)
            # Log type and keys to help debug mismatches (avoid dumping large blobs)
            if isinstance(school, dict):
                keys = list(school.keys())
                logger.debug(f"[SCHOOL:{school_id}] saas lookup returned dict with keys: {keys}")
                # If image blobs exist, log their lengths (not contents)
                if 'left_image_blob' in school:
                    left_len = len(school.get('left_image_blob') or '')
                    logger.debug(f"[SCHOOL:{school_id}] left_image_blob length: {left_len}")
                if 'right_image_blob' in school:
                    right_len = len(school.get('right_image_blob') or '')
                    logger.debug(f"[SCHOOL:{school_id}] right_image_blob length: {right_len}")
            else:
                logger.debug(f"[SCHOOL:{school_id}] saas lookup returned non-dict: {type(school)} -> {school}")

            if not school:
                logger.warning(f"[SCHOOL:{school_id}] School not found in saas_root_db")
                raise HTTPException(status_code=404, detail="School not found")

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"[SCHOOL:{school_id}] ❌ Error while fetching school from saas_root_db: {e}")
            raise HTTPException(status_code=500, detail="Failed to lookup school in saas_root_db")

        # Map root DB fields to SchoolResponse-compatible shape
        try:
            # Priority: school_name (from fee-voucher-settings sync) > name > display_name
            school_name = school.get("school_name") or school.get("name") or school.get("display_name") or ''
            response = {
                "id": school.get("id") or school.get("_id") or str(school_id),
                "name": school_name,
                "display_name": school_name,
                "email": school.get("email"),
                "phone": school.get("phone"),
                "address": school.get("address"),
                "city": school.get("city"),
                "is_active": school.get("is_active", True),
                "created_at": school.get("created_at"),
                "left_image_blob": school.get("left_image_blob"),
                "right_image_blob": school.get("right_image_blob")
            }
            logger.info(f"[SCHOOL:{school_id}] [DEBUG] Mapped response: school_name={school_name}, email={response.get('email')}, has_left_blob={bool(school.get('left_image_blob'))}, has_right_blob={bool(school.get('right_image_blob'))}")
        except Exception as e:
            logger.exception(f"[SCHOOL:{school_id}] ❌ Failed to map school fields: {e}")
            raise HTTPException(status_code=500, detail="Failed to prepare school response")
        logger.info(f"[SCHOOL:{school_id}] ✅ School info retrieved (from saas_root_db)")
        # Log the response being sent to frontend for debugging
        logger.info(f"[SCHOOL:{school_id}] [DEBUG] Response keys: {list(response.keys())}")
        logger.info(f"[SCHOOL:{school_id}] [DEBUG] name={response.get('name')}, display_name={response.get('display_name')}, email={response.get('email')}")
        return response
    except Exception as e:
        school_id = current_user.get("school_id")
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch school info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
