from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.class_subject import SubjectSchema, SubjectInDB, ClassSchema, ClassInDB
from app.services.class_subject import (
    get_all_subjects, get_subject_by_id, create_subject,
    get_all_classes, get_class_by_id, create_class,
    update_subject, delete_subject
)
from app.dependencies.auth import check_permission

router = APIRouter()

# Subject endpoints
@router.get("/subjects", response_model=List[SubjectInDB])
async def get_subjects(current_user: dict = Depends(check_permission("academics.view_classes"))):
    """Get all subjects"""
    subjects = get_all_subjects()
    return subjects

@router.get("/subjects/{subject_id}", response_model=SubjectInDB)
async def get_subject(
    subject_id: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get subject by ID"""
    subject = get_subject_by_id(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.post("/subjects", response_model=SubjectInDB)
async def create_new_subject(
    subject_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    """Create new subject (accepts simplified payloads)."""
    data = dict(subject_data)
    if 'subject_name' not in data and 'name' in data:
        data['subject_name'] = data.pop('name')
    if 'subject_code' not in data and 'code' in data:
        data['subject_code'] = data.pop('code')

    # support new shape: assigned_classes = [{class_name, section, teacher_id, time}, ...]
    assigned_classes = data.get('assigned_classes') or ([] if not data.get('assigned_class') else [{'class_name': data.get('assigned_class')}])

    subject = create_subject(
        subject_name=data.get('subject_name'),
        subject_code=data.get('subject_code'),
        assigned_classes=assigned_classes
    )
    if not subject:
        raise HTTPException(status_code=400, detail="Subject with this code already exists or invalid data")
    return subject


@router.put("/subjects/{subject_id}", response_model=SubjectInDB)
async def update_existing_subject(
    subject_id: str,
    subject_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    data = dict(subject_data)
    if 'subject_name' not in data and 'name' in data:
        data['subject_name'] = data.pop('name')
    if 'subject_code' not in data and 'code' in data:
        data['subject_code'] = data.pop('code')

    updated = update_subject(
        subject_id=subject_id,
        subject_name=data.get('subject_name'),
        subject_code=data.get('subject_code'),
        assigned_classes=data.get('assigned_classes')
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found or invalid data")
    return updated


@router.delete("/subjects/{subject_id}")
async def remove_subject(
    subject_id: str,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    ok = delete_subject(subject_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"deleted": True}

# Class endpoints
@router.get("/classes", response_model=List[ClassInDB])
async def get_classes(current_user: dict = Depends(check_permission("academics.view_classes"))):
    """Get all classes"""
    classes = get_all_classes()
    return classes

@router.get("/classes/{class_id}", response_model=ClassInDB)
async def get_class(
    class_id: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get class by ID"""
    cls = get_class_by_id(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    return cls

@router.post("/classes", response_model=ClassInDB)
async def create_new_class(
    class_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    """Create new class from simplified payloads (map `name` -> `class_name`)."""
    data = dict(class_data)
    if 'class_name' not in data and 'name' in data:
        data['class_name'] = data.pop('name')

    cls = create_class(
        class_name=data.get('class_name'),
        section=data.get('section'),
        assigned_subjects=data.get('assigned_subjects', []),
        assigned_teachers=data.get('assigned_teachers', [])
    )
    if not cls:
        raise HTTPException(status_code=400, detail="Class already exists or invalid data")
    return cls