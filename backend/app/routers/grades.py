from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.grade import GradeSchema, GradeInDB, GradeUpdate
from app.services.grade import (
    create_grade, get_all_grades, get_grade_by_id, get_grades_by_student, update_grade, delete_grade
)
from app.dependencies.auth import check_permission

router = APIRouter()


@router.get("/grades", response_model=List[GradeInDB])
async def list_grades(
    student_id: Optional[str] = None,
    current_user: dict = Depends(check_permission("students.read"))
):
    filters = {}
    if student_id:
        filters["student_id"] = student_id
    grades = get_all_grades(filters)
    return grades


@router.get("/grades/{grade_id}", response_model=GradeInDB)
async def get_grade(
    grade_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    grade = get_grade_by_id(grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    return grade


@router.post("/grades", response_model=GradeInDB)
async def create_new_grade(
    grade_data: GradeSchema,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    grade = create_grade(grade_data.dict())
    return grade


@router.put("/grades/{grade_id}", response_model=GradeInDB)
async def update_existing_grade(
    grade_id: str,
    grade_data: GradeUpdate,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    update_data = grade_data.dict(exclude_unset=True)
    grade = update_grade(grade_id, **update_data)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    return grade


@router.delete("/grades/{grade_id}")
async def delete_existing_grade(
    grade_id: str,
    current_user: dict = Depends(check_permission("grades.edit"))
):
    if not delete_grade(grade_id):
        raise HTTPException(status_code=404, detail="Grade not found")
    return {"message": "Grade deleted successfully"}
