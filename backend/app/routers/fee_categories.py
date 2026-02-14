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

router = APIRouter(prefix="/api/fee-categories", tags=["Fee Categories"])

@router.get("", response_model=List[FeeCategoryResponse])
async def list_fee_categories(
    include_archived: bool = False,
    current_user: dict = Depends(check_permission("inventory.view"))
):
    """Get all fee categories"""
    categories = get_all_fee_categories(include_archived=include_archived)
    
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
    
    return response

@router.get("/{category_id}", response_model=FeeCategoryResponse)
async def get_fee_category(
    category_id: str,
    current_user: dict = Depends(check_permission("inventory.view"))
):
    """Get fee category by ID"""
    category = get_fee_category_by_id(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Fee category not found")
    
    total = calculate_category_total(category.get("components", []))
    
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

@router.post("", response_model=FeeCategoryResponse)
async def create_new_fee_category(
    category: FeeCategory,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Create a new fee category"""
    data = category.dict()
    data["created_by"] = current_user.get("id")
    
    result = create_fee_category(data)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create fee category")
    
    total = calculate_category_total(result.get("components", []))
    
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

@router.put("/{category_id}", response_model=FeeCategoryResponse)
async def update_fee_category_route(
    category_id: str,
    update_data: FeeCategoryUpdate,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Update a fee category"""
    result = update_fee_category(category_id, update_data.dict(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Fee category not found")
    
    total = calculate_category_total(result.get("components", []))
    
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

@router.delete("/{category_id}")
async def delete_fee_category_route(
    category_id: str,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Archive a fee category"""
    success = archive_fee_category(category_id)
    if not success:
        raise HTTPException(status_code=404, detail="Fee category not found")
    
    return {"message": "Fee category archived successfully"}

@router.post("/{category_id}/duplicate")
async def duplicate_fee_category_route(
    category_id: str,
    new_name: str,
    current_user: dict = Depends(check_permission("inventory.manage"))
):
    """Duplicate a fee category"""
    result = duplicate_fee_category(category_id, new_name, current_user.get("id"))
    if not result:
        raise HTTPException(status_code=404, detail="Fee category not found")
    
    total = calculate_category_total(result.get("components", []))
    
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
