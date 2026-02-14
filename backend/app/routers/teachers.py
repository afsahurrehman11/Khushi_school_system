from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.teacher import TeacherSchema, TeacherInDB, TeacherCreate, TeacherUpdate
from app.services.teacher import (
    create_teacher, get_all_teachers, get_teacher_by_id,
    get_teacher_by_teacher_id, update_teacher, delete_teacher
)
from app.dependencies.auth import check_permission

router = APIRouter()


@router.get("/teachers", response_model=List[TeacherInDB])
async def list_teachers(
    current_user: dict = Depends(check_permission("teachers.read"))
):
    teachers = get_all_teachers()
    return teachers


@router.get("/teachers/{teacher_id}", response_model=TeacherInDB)
async def get_teacher(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.read"))
):
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.post("/teachers", response_model=TeacherInDB)
async def create_new_teacher(
    teacher_data: TeacherCreate,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    teacher = create_teacher(teacher_data.dict())
    if not teacher:
        raise HTTPException(status_code=400, detail="Teacher already exists or invalid data")
    return teacher


@router.put("/teachers/{teacher_id}", response_model=TeacherInDB)
async def update_existing_teacher(
    teacher_id: str,
    teacher_data: TeacherUpdate,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    update_data = teacher_data.dict(exclude_unset=True)
    teacher = update_teacher(teacher_id, **update_data)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.delete("/teachers/{teacher_id}")
async def delete_existing_teacher(
    teacher_id: str,
    current_user: dict = Depends(check_permission("teachers.write"))
):
    if not delete_teacher(teacher_id):
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted successfully"}


