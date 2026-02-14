from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.fee_category import ClassFeeAssignment, ClassFeeAssignmentInDB, ClassFeeAssignmentUpdate
from app.services.class_fee_assignment_service import (
    assign_fee_category_to_class, get_active_category_for_class,
    get_class_fee_assignment_history, get_all_fee_assignments,
    get_classes_using_category, update_class_fee_assignment,
    remove_fee_category_from_class
)
from app.dependencies.auth import check_permission

router = APIRouter(prefix="/api/class-fee-assignments", tags=["Class Fee Assignments"])

@router.get("", response_model=List[dict])
async def list_fee_assignments(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all active class fee assignments"""
    assignments = get_all_fee_assignments()
    return assignments

@router.get("/classes/{class_id}/active", response_model=dict)
async def get_class_active_category(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get currently active fee category for a class"""
    assignment = get_active_category_for_class(class_id)
    if not assignment:
        return {"class_id": class_id, "category_id": None, "message": "No active fee category assigned"}
    
    return assignment

@router.get("/classes/{class_id}/history", response_model=List[dict])
async def get_assignment_history(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee category assignment history for a class"""
    history = get_class_fee_assignment_history(class_id)
    return history

@router.get("/categories/{category_id}/classes", response_model=List[dict])
async def get_category_usage(
    category_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all classes using a fee category"""
    classes = get_classes_using_category(category_id)
    return classes

@router.post("")
async def assign_category_to_class(
    assignment: ClassFeeAssignment,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Assign a fee category to a class"""
    result = assign_fee_category_to_class(
        class_id=assignment.class_id,
        category_id=assignment.category_id,
        assigned_by=current_user.get("id"),
        apply_to_existing=assignment.apply_to_existing if hasattr(assignment, 'apply_to_existing') else False
    )
    
    if not result:
        raise HTTPException(status_code=400, detail="Failed to assign fee category")
    
    return result

@router.put("/{assignment_id}")
async def update_category_assignment(
    assignment_id: str,
    update_data: ClassFeeAssignmentUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update fee category assignment for a class"""
    if not update_data.category_id:
        raise HTTPException(status_code=400, detail="category_id is required")
    
    result = update_class_fee_assignment(
        assignment_id=assignment_id,
        category_id=update_data.category_id,
        assigned_by=current_user.get("id")
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return result

@router.delete("/classes/{class_id}")
async def remove_category_from_class(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Remove fee category assignment from a class"""
    success = remove_fee_category_from_class(class_id)
    if not success:
        raise HTTPException(status_code=404, detail="No active assignment found")
    
    return {"message": "Fee category removed from class"}
