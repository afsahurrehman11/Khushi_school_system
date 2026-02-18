from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.student import StudentSchema, StudentInDB, StudentUpdate
from app.services.student import (
    get_all_students, get_student_by_id, get_student_by_student_id,
    create_student, update_student, delete_student
)
from app.services.student import import_students_from_workbook_bytes, export_students_to_workbook_bytes, parse_students_from_workbook_bytes, import_students_with_images
from app.services.student_image_service import StudentImageService
from app.services.cloudinary_service import CloudinaryService
from app.services.embedding_job import BackgroundEmbeddingService
from fastapi import UploadFile, File, Form
from fastapi.responses import StreamingResponse
from app.dependencies.auth import check_permission
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/students", response_model=List[StudentInDB])
async def get_students(
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get all students with optional filters (school-isolated for non-Root)"""
    try:
        school_id = current_user.get("school_id")  # Get from token for Admin users
        
        logger.info(f"[SCHOOL:{school_id or 'N/A'}] [ADMIN:{current_user.get('email')}] Fetching students with filters: class_id={class_id}, status={status}")
        
        filters = {}
        if class_id:
            filters["class_id"] = class_id
        if status:
            filters["status"] = status

        # Pass schoolId for filtering (None for Root, specific ID for Admin)
        students = get_all_students(filters, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Retrieved {len(students)} students")
        return students
    except Exception as e:
        logger.error(f"❌ Failed to fetch students: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/students/{student_id}", response_model=StudentInDB)
async def get_student(
    student_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get student by ID (school-isolated for non-Root)"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"[SCHOOL:{school_id or 'N/A'}] 🔍 Fetching student by ID: {student_id}")
        
        student = get_student_by_id(student_id, school_id=school_id)
        if not student:
            logger.warning(f"[SCHOOL:{school_id or 'N/A'}] ⚠️ Student not found: {student_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        logger.info(f"[SCHOOL:{school_id or 'N/A'}] ✅ Student retrieved: {student_id}")
        return student
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to fetch student {student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/students/by-student-id/{student_id}", response_model=StudentInDB)
async def get_student_by_student_id_endpoint(
    student_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get student by student ID"""
    try:
        logger.info(f"🔍 Fetching student by student ID: {student_id}")
        
        student = get_student_by_student_id(student_id)
        if not student:
            logger.warning(f"⚠️ Student not found by student ID: {student_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        logger.info(f"✅ Student retrieved by student ID: {student_id}")
        return student
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to fetch student by student ID {student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/students", response_model=StudentInDB)
async def create_new_student(
    student_data: dict,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Create new student. Accepts partial payloads from admin and fills defaults when possible."""
    try:
        logger.info(f"📝 Creating new student via API: {student_data.get('full_name', 'Unknown')}")
        
        # Allow frontend to send simplified payloads (e.g., {name, roll, class})
        # Normalize keys to backend model
        data = dict(student_data)
        # map legacy 'name' -> 'full_name'
        if 'name' in data and 'full_name' not in data:
            data['full_name'] = data.pop('name')
        # map 'class' to 'class_id'
        if 'class' in data and 'class_id' not in data:
            data['class_id'] = data.pop('class')

        # Fill minimal required fields with defaults if missing
        data.setdefault('full_name', 'Unnamed Student')
        data.setdefault('gender', 'Not specified')
        data.setdefault('date_of_birth', datetime.utcnow().strftime('%Y-%m-%d'))
        data.setdefault('admission_date', datetime.utcnow().strftime('%Y-%m-%d'))
        data.setdefault('section', data.get('section', 'A'))
        data.setdefault('roll_number', data.get('roll_number') or data.get('roll') or '')
        data.setdefault('subjects', data.get('subjects', []))
        data.setdefault('assigned_teacher_ids', data.get('assigned_teacher_ids', []))
        data.setdefault('status', data.get('status', 'active'))
        data.setdefault('academic_year', data.get('academic_year', f"{datetime.utcnow().year}-{datetime.utcnow().year+1}"))

        # Determine school_id from authenticated user or payload (Root may specify)
        school_id = current_user.get("school_id") or current_user.get("school_id_context")
        role = current_user.get("role")
        if not school_id:
            # Allow Root to create for any school if they provided school_id in payload
            if role == "Root":
                school_id = data.get("school_id")
            else:
                logger.error("❌ Missing school context for student creation")
                raise HTTPException(status_code=400, detail="Missing school context for student creation")

        data["school_id"] = school_id

        student = create_student(data)
        if not student:
            logger.error("❌ Failed to create student - possible duplicate ID")
            raise HTTPException(status_code=400, detail="Failed to create student. Student ID may already exist.")
        
        logger.info(f"✅ Student created successfully: {student['student_id']}")
        return student
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error creating student: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/students/with-image", response_model=StudentInDB)
async def create_student_with_image(
    student_data: str = Form(...),
    image: Optional[UploadFile] = File(None),
    current_user: dict = Depends(check_permission("students.write"))
):
    """
    Create new student with optional image upload.
    If image is provided and upload fails, student creation is aborted.
    """
    try:
        school_id = current_user.get("school_id") or current_user.get("school_id_context")
        
        # Parse student data from JSON string
        try:
            data = json.loads(student_data)
        except json.JSONDecodeError as e:
            logger.error(f"🔴 [STUDENT] Invalid JSON data: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid student data format")
        
        logger.info(f"🟢 [STUDENT] Creating: {data.get('full_name', 'Unknown')}")
        
        # Process image first if provided
        image_url = None
        image_public_id = None
        
        if image and image.filename:
            logger.info(f"🔵 [UPLOAD] Processing image: {image.filename}")
            
            # Read and validate image
            image_content = await image.read()
            if not image_content:
                logger.error("🔴 [UPLOAD] Empty image file")
                raise HTTPException(status_code=400, detail="Empty image file")
            
            # Validate image format
            allowed_formats = ['.jpg', '.jpeg', '.png']
            file_ext = image.filename.lower().split('.')[-1] if '.' in image.filename else ''
            if f'.{file_ext}' not in allowed_formats:
                logger.error(f"🔴 [UPLOAD] Invalid format: {file_ext}")
                raise HTTPException(status_code=400, detail="Invalid image format. Allowed: jpg, jpeg, png")
            
            # Generate temp student_id for folder path (will update after creation)
            temp_id = f"temp_{datetime.utcnow().timestamp()}"
            
            # Upload to Cloudinary
            upload_result = CloudinaryService.upload_image(
                image_content,
                image.filename,
                temp_id,
                school_id
            )
            
            if not upload_result:
                logger.error("🔴 [UPLOAD] Failed - aborting student creation")
                raise HTTPException(status_code=400, detail="Image upload failed. Student not created.")
            
            image_url = upload_result["secure_url"]
            image_public_id = upload_result["public_id"]
            logger.info(f"🟢 [UPLOAD] Success: {image.filename}")
        
        # Normalize keys
        if 'name' in data and 'full_name' not in data:
            data['full_name'] = data.pop('name')
        if 'class' in data and 'class_id' not in data:
            data['class_id'] = data.pop('class')
        
        # Fill defaults
        data.setdefault('full_name', 'Unnamed Student')
        data.setdefault('gender', 'Not specified')
        data.setdefault('date_of_birth', datetime.utcnow().strftime('%Y-%m-%d'))
        data.setdefault('admission_date', datetime.utcnow().strftime('%Y-%m-%d'))
        data.setdefault('section', 'A')
        data.setdefault('roll_number', data.get('roll_number') or data.get('roll') or '')
        data.setdefault('subjects', [])
        data.setdefault('assigned_teacher_ids', [])
        data.setdefault('status', 'active')
        data.setdefault('academic_year', f"{datetime.utcnow().year}-{datetime.utcnow().year+1}")
        # Ensure school_id present for creation (allow Root to specify)
        role = current_user.get("role")
        if not school_id:
            if role == "Root":
                school_id = data.get("school_id")
            else:
                logger.error("❌ Missing school context for student creation")
                raise HTTPException(status_code=400, detail="Missing school context for student creation")

        data['school_id'] = school_id
        # Add image data if uploaded
        if image_url:
            data['profile_image_url'] = image_url
            data['profile_image_public_id'] = image_public_id
            data['image_uploaded_at'] = datetime.utcnow()
            data['embedding_status'] = 'pending'
        
        # Create student
        student = create_student(data)
        if not student:
            # Rollback image upload if student creation failed
            if image_public_id:
                logger.warning(f"🔴 [STUDENT] Creation failed - rolling back image upload")
                CloudinaryService.delete_image(image_public_id)
            raise HTTPException(status_code=400, detail="Failed to create student. Student ID may already exist.")
        
        logger.info(f"🟢 [STUDENT] Created: {student['student_id']}")
        return student
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴 [STUDENT] Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post('/students/import')
async def import_students(
    class_id: str = Form(...),
    preview: bool = Form(False),
    file: UploadFile = File(...),
    current_user: dict = Depends(check_permission('students.write'))
):
    """Import students from uploaded Excel file. If preview=true, returns a preview of first rows without creating."""
    try:
        logger.info(f"📊 Importing students from file: {file.filename}")
        
        if file.content_type not in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'):
            logger.error("❌ Invalid file type uploaded")
            raise HTTPException(status_code=400, detail='Invalid file type; please upload an Excel (.xlsx) file')

        content = await file.read()
        
        if preview:
            logger.info("👀 Generating import preview")
            parsed = parse_students_from_workbook_bytes(content)
            return {'preview': parsed}
        
        logger.info("🚀 Starting student import")
        created, errors = import_students_from_workbook_bytes(content, class_id)
        logger.info(f"✅ Import completed: {len(created)} created, {len(errors)} errors")
        
        return {'created': created, 'errors': errors}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Import failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/students/import-with-images')
async def import_students_with_images_endpoint(
    class_id: str = Form(...),
    file: UploadFile = File(...),
    images: Optional[UploadFile] = File(None),
    current_user: dict = Depends(check_permission('students.write'))
):
    """
    Import students from Excel file with optional ZIP file containing student images.
    
    Excel must contain columns: name, father_name, parent_cnic, registration_id
    ZIP should contain images named with student registration IDs (e.g., 0000-001.jpg)
    """
    try:
        logger.info(f"📊 Importing students with images from {file.filename}")
        
        if file.content_type not in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'):
            logger.error("❌ Invalid Excel file type uploaded")
            raise HTTPException(status_code=400, detail='Invalid file type; please upload an Excel (.xlsx) file')
        
        xlsx_content = await file.read()
        zip_content = None
        
        if images:
            if not images.content_type.startswith('application/zip') and images.content_type != 'application/x-zip-compressed':
                logger.error("❌ Invalid ZIP file type uploaded")
                raise HTTPException(status_code=400, detail='Invalid file type for images; please upload a ZIP file')
            
            zip_content = await images.read()
            logger.info(f"📦 ZIP file received: {images.filename}")
        
        result = import_students_with_images(xlsx_content, zip_content, class_id)
        
        if not result["success"]:
            logger.error(f"❌ Import failed: {result.get('error')}")
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        logger.info(f"✅ Import completed: {result['summary']}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Import with images failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/students/export')
async def export_students(
    class_id: Optional[str] = None,
    section: Optional[str] = None,
    current_user: dict = Depends(check_permission('students.read'))
):
    """Export students as Excel file"""
    try:
        logger.info(f"📤 Exporting students with filters: class_id={class_id}, section={section}")
        
        filters = {}
        if class_id:
            filters['class_id'] = class_id
        if section:
            filters['section'] = section

        xlsx_bytes = export_students_to_workbook_bytes(filters)
        logger.info(f"✅ Export completed successfully")
        
        return StreamingResponse(iter([xlsx_bytes]), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={
            'Content-Disposition': 'attachment; filename="students_export.xlsx"'
        })
    except Exception as e:
        logger.error(f"❌ Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/students/{student_id}", response_model=StudentInDB)
async def update_existing_student(
    student_id: str,
    student_data: StudentUpdate,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Update student"""
    try:
        logger.info(f"🔄 Updating student: {student_id}")
        
        update_data = student_data.dict(exclude_unset=True)
        student = update_student(student_id, **update_data)
        if not student:
            logger.warning(f"⚠️ Student not found: {student_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        logger.info(f"✅ Student updated successfully: {student_id}")
        return student
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Update failed for student {student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/students/{student_id}")
async def delete_existing_student(
    student_id: str,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Delete student"""
    try:
        logger.info(f"🗑️ Deleting student: {student_id}")
        
        if not delete_student(student_id):
            logger.warning(f"⚠️ Student not found for deletion: {student_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        logger.info(f"✅ Student deleted successfully: {student_id}")
        return {"message": "Student deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Delete failed for student {student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================ Image Management Endpoints ================

@router.post("/students/{student_id}/image")
async def upload_student_image(
    student_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(check_permission("students.write"))
):
    """Upload profile image for a student"""
    try:
        school_id = current_user.get("school_id")
        logger.info(f"🔵 [UPLOAD] Uploading image for student: {student_id}")
        
        content = await file.read()
        result = await StudentImageService.upload_student_image(
            student_id, 
            content, 
            file.filename or "image",
            school_id
        )
        
        if not result["success"]:
            logger.error(f"🔴 [UPLOAD] Failed for {student_id}: {result.get('error')}")
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        logger.info(f"🟢 [UPLOAD] Success: {student_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error uploading image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/students/{student_id}/image")
async def delete_student_image(
    student_id: str,
    current_user: dict = Depends(check_permission("students.write"))
):
    """Delete profile image for a student"""
    try:
        logger.info(f"🗑️ Deleting image for student: {student_id}")
        
        result = await StudentImageService.delete_student_image(student_id)
        
        if not result["success"]:
            logger.warning(f"⚠️ Image delete failed for {student_id}: {result.get('error')}")
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        logger.info(f"✅ Image deleted successfully for student: {student_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error deleting image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================ Missing Photos Dashboard ================

@router.get("/students/photos/missing-summary")
async def get_missing_photos_summary(
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get summary of students missing photos by class"""
    try:
        logger.info("📊 Fetching missing photos summary")
        result = await StudentImageService.get_students_missing_photos()
        logger.info(f"✅ Retrieved missing photos data for {len(result.get('data', []))} classes")
        return result
    except Exception as e:
        logger.error(f"❌ Failed to fetch missing photos summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/students/photos/missing-by-class/{class_id}")
async def get_missing_photos_by_class(
    class_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get list of students missing photos in a specific class"""
    try:
        logger.info(f"👥 Fetching missing photos for class: {class_id}")
        result = await StudentImageService.get_class_students_missing_photos(class_id)
        logger.info(f"✅ Retrieved {len(result.get('students', []))} students missing photos")
        return result
    except Exception as e:
        logger.error(f"❌ Failed to fetch students missing photos: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ================ Face Embedding Control Panel ================

@router.post("/embeddings/generate-all")
async def generate_all_embeddings(
    current_user: dict = Depends(check_permission("students.write"))
):
    """Start background job to generate embeddings for all students with images"""
    try:
        logger.info("🔄 Starting embedding generation for all students")
        job_id = BackgroundEmbeddingService.start_embedding_job("all")
        logger.info(f"✅ Job started: {job_id}")
        return {
            "success": True,
            "job_id": job_id,
            "message": "Embedding generation started in background"
        }
    except Exception as e:
        logger.error(f"❌ Failed to start embedding job: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embeddings/generate-missing")
async def generate_missing_embeddings(
    current_user: dict = Depends(check_permission("students.write"))
):
    """Start background job to generate embeddings only for students with images but no embedding"""
    try:
        logger.info("🔄 Starting embedding generation for missing embeddings")
        job_id = BackgroundEmbeddingService.start_embedding_job("missing")
        logger.info(f"✅ Job started: {job_id}")
        return {
            "success": True,
            "job_id": job_id,
            "message": "Embedding generation started in background"
        }
    except Exception as e:
        logger.error(f"❌ Failed to start embedding job: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/embeddings/job-status/{job_id}")
async def get_embedding_job_status(
    job_id: str,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get status of an embedding generation job"""
    try:
        logger.info(f"📊 Fetching status for job: {job_id}")
        status = BackgroundEmbeddingService.get_job_status(job_id)
        
        if not status:
            logger.warning(f"⚠️ Job not found: {job_id}")
            raise HTTPException(status_code=404, detail="Job not found")
        
        logger.info(f"✅ Retrieved status for job: {job_id}")
        return status
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to fetch job status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/embeddings/students")
async def get_students_with_embeddings(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(check_permission("students.read"))
):
    """Get paginated list of students with embeddings (for recognition system)"""
    try:
        logger.info(f"📚 Fetching students with embeddings: skip={skip}, limit={limit}")
        
        from app.database import get_db
        db = get_db()
        student_collection = db["students"]
        
        # Get students with face embeddings
        students = list(student_collection.find({
            "face_embedding": {"$exists": True, "$ne": None},
            "embedding_status": "generated"
        }).skip(skip).limit(limit))
        
        # Get total count
        total_count = student_collection.count_documents({
            "face_embedding": {"$exists": True, "$ne": None},
            "embedding_status": "generated"
        })
        
        # Format response
        result = []
        for student in students:
            result.append({
                "id": str(student.get("_id")),
                "student_id": student.get("student_id"),
                "full_name": student.get("full_name"),
                "class_id": student.get("class_id"),
                "embedding": student.get("face_embedding"),
                "embedding_model": student.get("embedding_model"),
                "embedding_generated_at": student.get("embedding_generated_at")
            })
        
        logger.info(f"✅ Retrieved {len(result)} students with embeddings")
        return {
            "success": True,
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "students": result
        }
    except Exception as e:
        logger.error(f"❌ Failed to fetch students with embeddings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))