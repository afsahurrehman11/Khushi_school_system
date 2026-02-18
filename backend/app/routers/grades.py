from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import logging
from app.models.grade import GradeSchema, GradeInDB, GradeUpdate
from app.services.grade import (
    create_grade, get_all_grades, get_grade_by_id, get_grades_by_student, update_grade, delete_grade
)
from app.dependencies.auth import check_permission

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/grades", response_model=List[GradeInDB])
async def list_grades(
    student_id: Optional[str] = None,
    current_user: dict = Depends(check_permission("students.read"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching grades")
    try:
        filters = {}
        if student_id:
            filters["student_id"] = student_id
        grades = get_all_grades(filters, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(grades)} grades")
        return grades
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch grades: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch grades")


@router.get("/grades/{grade_id}", response_model=GradeInDB)
async def get_grade(
    grade_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching grade {grade_id}")
    try:
        grade = get_grade_by_id(grade_id, school_id=school_id)
        if not grade:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Grade {grade_id} not found")
            raise HTTPException(status_code=404, detail="Grade not found")
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Grade {grade_id} found")
        return grade
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch grade: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch grade")


@router.post("/grades", response_model=GradeInDB)
async def create_new_grade(
    grade_data: GradeSchema,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating grade")
    try:
        grade = create_grade(grade_data.dict(), school_id=school_id)
        if not grade:
            logger.warning(f"[SCHOOL:{school_id}] Grade creation failed")
            raise HTTPException(status_code=400, detail="Invalid grade data")
        logger.info(f"[SCHOOL:{school_id}] ✅ Grade {grade.get('_id')} created")
        return grade
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create grade: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create grade")


@router.put("/grades/{grade_id}", response_model=GradeInDB)
async def update_existing_grade(
    grade_id: str,
    grade_data: GradeUpdate,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating grade {grade_id}")
    try:
        update_data = grade_data.dict(exclude_unset=True)
        grade = update_grade(grade_id, school_id=school_id, **update_data)
        if not grade:
            logger.warning(f"[SCHOOL:{school_id}] Grade {grade_id} not found")
            raise HTTPException(status_code=404, detail="Grade not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Grade {grade_id} updated")
        return grade
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update grade: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update grade")


@router.delete("/grades/{grade_id}")
async def delete_existing_grade(
    grade_id: str,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting grade {grade_id}")
    try:
        if not delete_grade(grade_id, school_id=school_id):
            logger.warning(f"[SCHOOL:{school_id}] Grade {grade_id} not found")
            raise HTTPException(status_code=404, detail="Grade not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Grade {grade_id} deleted")
        return {"message": "Grade deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete grade: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete grade")
