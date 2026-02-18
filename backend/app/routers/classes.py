from fastapi import APIRouter, Depends, HTTPException
from typing import List
import logging
from app.models.class_subject import SubjectSchema, SubjectInDB, ClassSchema, ClassInDB
from app.services.class_subject import (
    get_all_subjects, get_subject_by_id, create_subject,
    get_all_classes, get_class_by_id, create_class,
    update_subject, delete_subject
)
from app.dependencies.auth import check_permission

logger = logging.getLogger(__name__)
router = APIRouter()

# Subject endpoints
@router.get("/subjects", response_model=List[SubjectInDB])
async def get_subjects(current_user: dict = Depends(check_permission("academics.view_classes"))):
    """Get all subjects"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching subjects")
    try:
        subjects = get_all_subjects(school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(subjects)} subjects")
        return subjects
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch subjects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch subjects")

@router.get("/subjects/{subject_id}", response_model=SubjectInDB)
async def get_subject(
    subject_id: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get subject by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching subject {subject_id}")
    try:
        subject = get_subject_by_id(subject_id, school_id=school_id)
        if not subject:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Subject {subject_id} not found")
            raise HTTPException(status_code=404, detail="Subject not found")
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Subject {subject_id} found")
        return subject
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch subject: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch subject")

@router.post("/subjects", response_model=SubjectInDB)
async def create_new_subject(
    subject_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    """Create new subject (accepts simplified payloads)."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating subject")
    try:
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
            assigned_classes=assigned_classes,
            school_id=school_id
        )
        if not subject:
            logger.warning(f"[SCHOOL:{school_id}] Subject creation failed - code may exist or invalid data")
            raise HTTPException(status_code=400, detail="Subject with this code already exists or invalid data")
        logger.info(f"[SCHOOL:{school_id}] ✅ Subject {subject.get('_id')} created")
        return subject
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create subject: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create subject")


@router.put("/subjects/{subject_id}", response_model=SubjectInDB)
async def update_existing_subject(
    subject_id: str,
    subject_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating subject {subject_id}")
    try:
        data = dict(subject_data)
        if 'subject_name' not in data and 'name' in data:
            data['subject_name'] = data.pop('name')
        if 'subject_code' not in data and 'code' in data:
            data['subject_code'] = data.pop('code')

        updated = update_subject(
            subject_id=subject_id,
            subject_name=data.get('subject_name'),
            subject_code=data.get('subject_code'),
            assigned_classes=data.get('assigned_classes'),
            school_id=school_id
        )
        if not updated:
            logger.warning(f"[SCHOOL:{school_id}] Subject {subject_id} not found or invalid data")
            raise HTTPException(status_code=404, detail="Subject not found or invalid data")
        logger.info(f"[SCHOOL:{school_id}] ✅ Subject {subject_id} updated")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update subject: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update subject")


@router.delete("/subjects/{subject_id}")
async def remove_subject(
    subject_id: str,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting subject {subject_id}")
    try:
        ok = delete_subject(subject_id, school_id=school_id)
        if not ok:
            logger.warning(f"[SCHOOL:{school_id}] Subject {subject_id} not found")
            raise HTTPException(status_code=404, detail="Subject not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Subject {subject_id} deleted")
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete subject: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete subject")

# Class endpoints
@router.get("/classes", response_model=List[ClassInDB])
async def get_classes(current_user: dict = Depends(check_permission("academics.view_classes"))):
    """Get all classes"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching classes")
    try:
        classes = get_all_classes(school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(classes)} classes")
        return classes
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch classes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch classes")

@router.get("/classes/{class_id}", response_model=ClassInDB)
async def get_class(
    class_id: str,
    current_user: dict = Depends(check_permission("academics.view_classes"))
):
    """Get class by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching class {class_id}")
    try:
        cls = get_class_by_id(class_id, school_id=school_id)
        if not cls:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Class {class_id} not found")
            raise HTTPException(status_code=404, detail="Class not found")
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Class {class_id} found")
        return cls
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch class: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch class")

@router.post("/classes", response_model=ClassInDB)
async def create_new_class(
    class_data: dict,
    current_user: dict = Depends(check_permission("academics.assign_subjects"))
):
    """Create new class from simplified payloads (map `name` -> `class_name`)."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating class")
    try:
        data = dict(class_data)
        if 'class_name' not in data and 'name' in data:
            data['class_name'] = data.pop('name')

        cls = create_class(
            class_name=data.get('class_name'),
            section=data.get('section'),
            assigned_subjects=data.get('assigned_subjects', []),
            assigned_teachers=data.get('assigned_teachers', []),
            school_id=school_id
        )
        if not cls:
            logger.warning(f"[SCHOOL:{school_id}] Class creation failed - may already exist or invalid data")
            raise HTTPException(status_code=400, detail="Class already exists or invalid data")
        logger.info(f"[SCHOOL:{school_id}] ✅ Class {cls.get('_id')} created")
        return cls
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create class: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create class")