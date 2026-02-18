from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.fee_category import (
    FeeCategory, FeeCategoryInDB, FeeCategoryUpdate, FeeCategoryResponse,
    FeeComponent
)
from app.services.fee_category_service import (
    create_fee_category, get_all_fee_categories, get_fee_category_by_id,
    update_fee_category, delete_fee_category, archive_fee_category,
    duplicate_fee_category, calculate_category_total
)
from app.dependencies.auth import check_permission
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/fee-categories", tags=["Fee Categories"])

@router.get("", response_model=List[FeeCategoryResponse])
async def list_fee_categories(
    include_archived: bool = False,
    current_user: dict = Depends(check_permission("inventory.view"))
):
    """Get all fee categories for current school"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Listing fee categories")
    
    try:
        categories = get_all_fee_categories(include_archived=include_archived, school_id=school_id)
        
        response = []
        for cat in categories:
            total = calculate_category_total(cat.get("components", []))
            response.append({
                "id": cat.get("id"),
                "name": cat.get("name"),
                "description": cat.get("description"),
                "components": cat.get("components", []),
                "total_amount": total,
                "is_archived": cat.get("is_archived", False),
                "created_at": cat.get("created_at"),
                "created_by": cat.get("created_by"),
            })
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(response)} fee categories")
        return response
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to list fee categories: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list fee categories")

@router.get("/{category_id}", response_model=FeeCategoryResponse)
async def get_fee_category(
    category_id: str,
    current_user: dict = Depends(check_permission("inventory.view"))
):
    """Get fee category by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching fee category {category_id}")
    
    try:
        category = get_fee_category_by_id(category_id, school_id=school_id)
        if not category:
            logger.error(f"[SCHOOL:{school_id}] ❌ Fee category {category_id} not found")
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        total = calculate_category_total(category.get("components", []))
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved fee category {category_id}")
        return {
            "id": category.get("id"),
            "name": category.get("name"),
            "description": category.get("description"),
            "components": category.get("components", []),
            "total_amount": total,
            "is_archived": category.get("is_archived", False),
            "created_at": category.get("created_at"),
            "created_by": category.get("created_by"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch fee category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch fee category")

@router.post("", response_model=FeeCategoryResponse)
async def create_new_fee_category(
    category: FeeCategory,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Create a new fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating new fee category")
    
    try:
        data = category.dict()
        data["created_by"] = current_user.get("id")
        
        result = create_fee_category(data, school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create fee category")
            raise HTTPException(status_code=400, detail="Failed to create fee category")
        
        total = calculate_category_total(result.get("components", []))
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Created fee category successfully")
        return {
            "id": result.get("id"),
            "name": result.get("name"),
            "description": result.get("description"),
            "components": result.get("components", []),
            "total_amount": total,
            "is_archived": result.get("is_archived", False),
            "created_at": result.get("created_at"),
            "created_by": result.get("created_by"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error creating fee category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create fee category")

@router.put("/{category_id}", response_model=FeeCategoryResponse)
async def update_fee_category_route(
    category_id: str,
    update_data: FeeCategoryUpdate,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Update a fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating fee category {category_id}")
    
    try:
        result = update_fee_category(category_id, update_data.dict(exclude_unset=True), school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Fee category {category_id} not found")
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        total = calculate_category_total(result.get("components", []))
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated fee category {category_id}")
        return {
            "id": result.get("id"),
            "name": result.get("name"),
            "description": result.get("description"),
            "components": result.get("components", []),
            "total_amount": total,
            "is_archived": result.get("is_archived", False),
            "created_at": result.get("created_at"),
            "created_by": result.get("created_by"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update fee category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update fee category")

@router.delete("/{category_id}")
async def delete_fee_category_route(
    category_id: str,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Archive a fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting fee category {category_id}")
    
    try:
        success = archive_fee_category(category_id, school_id=school_id)
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ Fee category {category_id} not found")
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Archived fee category {category_id}")
        return {"message": "Fee category archived successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete fee category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete fee category")

@router.post("/{category_id}/duplicate")
async def duplicate_fee_category_route(
    category_id: str,
    new_name: str,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Duplicate a fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Duplicating fee category {category_id}")
    
    try:
        result = duplicate_fee_category(category_id, new_name, current_user.get("id"), school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Fee category {category_id} not found")
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        total = calculate_category_total(result.get("components", []))
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Duplicated fee category {category_id}")
        return {
            "id": result.get("id"),
            "name": result.get("name"),
            "description": result.get("description"),
            "components": result.get("components", []),
            "total_amount": total,
            "is_archived": result.get("is_archived", False),
            "created_at": result.get("created_at"),
            "created_by": result.get("created_by"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to duplicate fee category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to duplicate fee category")
