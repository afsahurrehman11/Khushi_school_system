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
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/class-fee-assignments", tags=["Class Fee Assignments"])

@router.get("", response_model=List[dict])
async def list_fee_assignments(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all active class fee assignments"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Listing fee assignments")
    
    try:
        assignments = get_all_fee_assignments(school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(assignments)} fee assignments")
        return assignments
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to list assignments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list assignments")

@router.get("/classes/{class_id}/active", response_model=dict)
async def get_class_active_category(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get currently active fee category for a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching active category for class {class_id}")
    
    try:
        assignment = get_active_category_for_class(class_id, school_id=school_id)
        if not assignment:
            logger.info(f"[SCHOOL:{school_id}] No active fee category for class {class_id}")
            return {"class_id": class_id, "category_id": None, "message": "No active fee category assigned"}
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved active category")
        return assignment
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch active category")

@router.get("/classes/{class_id}/history", response_model=List[dict])
async def get_assignment_history(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee category assignment history for a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching assignment history for class {class_id}")
    
    try:
        history = get_class_fee_assignment_history(class_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(history)} historical assignments")
        return history
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch assignment history")

@router.get("/categories/{category_id}/classes", response_model=List[dict])
async def get_category_usage(
    category_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all classes using a fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching classes using category {category_id}")
    
    try:
        classes = get_classes_using_category(category_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(classes)} classes")
        return classes
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching category usage: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch category usage")

@router.post("")
async def assign_category_to_class(
    assignment: ClassFeeAssignment,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Assign a fee category to a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Assigning fee category to class")
    
    try:
        result = assign_fee_category_to_class(
            class_id=assignment.class_id,
            category_id=assignment.category_id,
            assigned_by=current_user.get("id"),
            school_id=school_id,
            apply_to_existing=assignment.apply_to_existing if hasattr(assignment, 'apply_to_existing') else False
        )
        
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to assign fee category")
            raise HTTPException(status_code=400, detail="Failed to assign fee category")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Assigned fee category to class")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error assigning category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to assign fee category")

@router.put("/{assignment_id}")
async def update_category_assignment(
    assignment_id: str,
    update_data: ClassFeeAssignmentUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update fee category assignment for a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating fee assignment {assignment_id}")
    
    try:
        if not update_data.category_id:
            logger.error(f"[SCHOOL:{school_id}] ❌ category_id is required")
            raise HTTPException(status_code=400, detail="category_id is required")
        
        result = update_class_fee_assignment(
            assignment_id=assignment_id,
            category_id=update_data.category_id,
            assigned_by=current_user.get("id"),
            school_id=school_id
        )
        
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Assignment {assignment_id} not found")
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated fee assignment")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error updating assignment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update assignment")

@router.delete("/classes/{class_id}")
async def remove_category_from_class(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Remove fee category assignment from a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Removing fee category from class {class_id}")
    
    try:
        success = remove_fee_category_from_class(class_id, school_id=school_id)
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ No active assignment found for class")
            raise HTTPException(status_code=404, detail="No active assignment found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Removed fee category from class")
        return {"message": "Fee category removed from class"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error removing assignment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to remove assignment")
