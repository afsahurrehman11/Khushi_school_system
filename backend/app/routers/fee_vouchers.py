"""
Fee Voucher Router
API endpoints for fee voucher generation and printing
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import logging
import traceback
from bson import ObjectId

from app.dependencies.auth import check_permission
from app.services.fee_voucher_service import (
    FeeVoucherService, 
    get_classes_with_fee_summary,
    generate_student_fee_voucher_with_photo,
    generate_class_vouchers_zip,
    generate_class_vouchers_combined_pdf
)
from app.services.voucher_job_service import (
    create_voucher_job,
    get_job_status,
    get_job_result,
    cleanup_old_jobs
)
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fees/vouchers", tags=["Fee Vouchers"])


# ================= Request/Response Models =================

class VoucherConfig(BaseModel):
    header_text: Optional[str] = None
    footer_text: Optional[str] = None
    due_date: Optional[str] = None


class FeeItem(BaseModel):
    name: str
    amount: float


class GenerateVoucherRequest(BaseModel):
    student_id: str
    fee_details: List[FeeItem]
    config: Optional[VoucherConfig] = None


class GenerateClassVouchersRequest(BaseModel):
    class_id: str
    fee_details: List[FeeItem]
    config: Optional[VoucherConfig] = None


# ================= Endpoints =================

@router.get("/classes")
async def get_classes_for_vouchers(
    current_user: dict = Depends(check_permission("fees.read"))
):
    """Get all classes with fee summary for voucher generation"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        classes = get_classes_with_fee_summary(school_id)
        return {"classes": classes}
    except Exception as e:
        logger.error(f"Error getting classes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/classes/{class_id}/students")
async def get_class_students_for_voucher(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """Get students in a class for voucher generation"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        service = FeeVoucherService(db)
        students = service.get_students_by_class(class_id, school_id)
        return {"students": students, "class_id": class_id}
    except Exception as e:
        logger.error(f"Error getting students: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fee-categories")
async def get_fee_categories(
    current_user: dict = Depends(check_permission("fees.read"))
):
    """Get fee categories for voucher generation"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        service = FeeVoucherService(db)
        categories = service.get_fee_categories(school_id)
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error getting fee categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/student")
async def generate_student_voucher(
    request: GenerateVoucherRequest,
    current_user: dict = Depends(check_permission("fees.write"))
):
    """Generate fee voucher PDF for a single student"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        service = FeeVoucherService(db)
        
        # Get student data
        from bson import ObjectId
        student = db.students.find_one({
            "_id": ObjectId(request.student_id),
            "school_id": school_id
        })
        
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        student_data = {
            "id": str(student["_id"]),
            "student_id": student.get("student_id"),
            "full_name": student.get("full_name"),
            "father_name": student.get("guardian_info", {}).get("father_name", ""),
            "roll_number": student.get("roll_number"),
            "class_id": student.get("class_id"),
            "section": student.get("section", "A")
        }
        
        school_info = service.get_school_info(school_id)
        
        fee_details = [{"name": f.name, "amount": f.amount} for f in request.fee_details]
        config = request.config.dict() if request.config else {}
        
        pdf_bytes = service.generate_voucher_pdf(
            student_data,
            fee_details,
            school_info,
            config
        )
        
        filename = f"voucher_{student_data['roll_number']}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating voucher: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/class")
async def generate_class_vouchers(
    request: GenerateClassVouchersRequest,
    current_user: dict = Depends(check_permission("fees.write"))
):
    """Generate combined fee voucher PDF for all students in a class"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        service = FeeVoucherService(db)
        
        # Get all students in class
        students_data = service.get_students_by_class(request.class_id, school_id)
        
        if not students_data:
            raise HTTPException(status_code=404, detail="No students found in class")
        
        # Override fees with request data
        fee_details = [{"name": f.name, "amount": f.amount} for f in request.fee_details]
        
        for student in students_data:
            student["fees"] = fee_details
            student["total_due"] = sum(f["amount"] for f in fee_details)
        
        school_info = service.get_school_info(school_id)
        config = request.config.dict() if request.config else {}
        
        pdf_bytes = service.generate_class_vouchers_pdf(
            students_data,
            school_info,
            config
        )
        
        filename = f"vouchers_class_{request.class_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating class vouchers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/print-preview/{class_id}")
async def get_print_preview_data(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """Get data for voucher print preview"""
    school_id = current_user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="School ID required")
    
    try:
        db = get_db()
        service = FeeVoucherService(db)
        
        students = service.get_students_by_class(class_id, school_id)
        categories = service.get_fee_categories(school_id)
        school_info = service.get_school_info(school_id)
        
        return {
            "students": students,
            "fee_categories": categories,
            "school_info": school_info,
            "class_id": class_id
        }
        
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error getting preview data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/student/{student_id}/download")
async def download_student_fee_voucher(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """
    Download fee voucher PDF for a student with their photo and complete fee details.
    Returns a landscape A4 PDF with school info, student details, and fee breakdown.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "Unknown")
    
    if not school_id:
        logger.error(f"[FEE_VOUCHER] ❌ No school_id in user context")
        raise HTTPException(status_code=400, detail="School ID required")
    
    logger.info(f"[FEE_VOUCHER] [SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating voucher for student: {student_id}")
    
    try:
        db = get_db()
        
        # Verify student exists and belongs to this school
        from bson import ObjectId
        student = db.students.find_one({
            "_id": ObjectId(student_id),
            "school_id": school_id
        })
        
        if not student:
            logger.error(f"[FEE_VOUCHER] ❌ Student {student_id} not found in school {school_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Generate PDF
        pdf_bytes = generate_student_fee_voucher_with_photo(student_id, school_id, db)
        
        # Create filename
        student_name = student.get("full_name", "student").replace(" ", "_")
        filename = f"fee_voucher_{student_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated voucher for {student.get('full_name')}")
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "application/pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[FEE_VOUCHER] ❌ Error generating voucher for student {student_id}: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Failed to generate fee voucher: {str(e)}")


@router.get("/student/{student_id}/print")
async def print_student_fee_voucher(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """
    Get fee voucher PDF for direct printing (inline display).
    Returns the same PDF as download but with inline disposition for browser print dialog.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "Unknown")
    
    if not school_id:
        logger.error(f"[FEE_VOUCHER] ❌ No school_id in user context")
        raise HTTPException(status_code=400, detail="School ID required")
    
    logger.info(f"[FEE_VOUCHER] [SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating print voucher for student: {student_id}")
    
    try:
        db = get_db()
        
        # Verify student exists
        from bson import ObjectId
        student = db.students.find_one({
            "_id": ObjectId(student_id),
            "school_id": school_id
        })
        
        if not student:
            logger.error(f"[FEE_VOUCHER] ❌ Student {student_id} not found in school {school_id}")
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Generate PDF
        pdf_bytes = generate_student_fee_voucher_with_photo(student_id, school_id, db)
        
        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated print voucher for {student.get('full_name')}")
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "inline",  # Display in browser for printing
                "Content-Type": "application/pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[FEE_VOUCHER] ❌ Error generating print voucher for student {student_id}: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Failed to generate fee voucher: {str(e)}")


@router.get("/class/{class_id}/download-all")
async def download_class_vouchers_zip(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """
    Download a ZIP file containing individual PDF vouchers for all students in a class.
    Each PDF is named with the student's roll number and name.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "Unknown")
    
    if not school_id:
        logger.error(f"[FEE_VOUCHER] ❌ No school_id in user context")
        raise HTTPException(status_code=400, detail="School ID required")
    
    logger.info(f"[FEE_VOUCHER] [SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating ZIP for class: {class_id}")
    
    try:
        db = get_db()
        
        # Verify class exists (try ObjectId first, then string class_id for UUID-based systems)
        class_doc = None
        try:
            class_doc = db.classes.find_one({
                "_id": ObjectId(class_id),
                "school_id": school_id
            })
        except:
            pass
        
        if not class_doc:
            class_doc = db.classes.find_one({
                "class_id": class_id,
                "school_id": school_id
            })
        
        if not class_doc:
            logger.error(f"[FEE_VOUCHER] ❌ Class {class_id} not found in school {school_id}")
            raise HTTPException(status_code=404, detail="Class not found")
        
        # Generate ZIP
        zip_bytes = generate_class_vouchers_zip(class_id, school_id, db)
        
        # Create filename
        class_name = class_doc.get("class_name", "class").replace(" ", "_")
        filename = f"fee_vouchers_{class_name}_{datetime.now().strftime('%Y%m%d')}.zip"
        
        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated ZIP for class {class_name}")
        
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "application/zip"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[FEE_VOUCHER] ❌ Error generating ZIP for class {class_id}: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Failed to generate vouchers ZIP: {str(e)}")


@router.get("/class/{class_id}/print-all")
async def print_class_vouchers_combined(
    class_id: str,
    current_user: dict = Depends(check_permission("fees.read"))
):
    """
    Generate a single combined PDF with all student vouchers (one per page) for printing.
    Opens inline in browser for direct printing.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "Unknown")
    
    if not school_id:
        logger.error(f"[FEE_VOUCHER] ❌ No school_id in user context")
        raise HTTPException(status_code=400, detail="School ID required")
    
    logger.info(f"[FEE_VOUCHER] [SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating combined PDF for class: {class_id}")
    
    try:
        db = get_db()
        
        # Verify class exists (try ObjectId first, then string class_id for UUID-based systems)
        class_doc = None
        try:
            class_doc = db.classes.find_one({
                "_id": ObjectId(class_id),
                "school_id": school_id
            })
        except:
            pass
        
        if not class_doc:
            class_doc = db.classes.find_one({
                "class_id": class_id,
                "school_id": school_id
            })
        
        if not class_doc:
            logger.error(f"[FEE_VOUCHER] ❌ Class {class_id} not found in school {school_id}")
            raise HTTPException(status_code=404, detail="Class not found")
        
        # Generate combined PDF
        pdf_bytes = generate_class_vouchers_combined_pdf(class_id, school_id, db)
        
        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated combined PDF for class {class_doc.get('class_name')}")
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "inline",  # Display in browser for printing
                "Content-Type": "application/pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[FEE_VOUCHER] ❌ Error generating combined PDF for class {class_id}: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Failed to generate combined PDF: {str(e)}")


# ================= Background Job Endpoints =================

@router.post("/class/{class_id}/download-all/background")
async def start_class_vouchers_zip_job(
    class_id: str,
    school_id: str = Depends(check_permission("fees.read")),
    current_user = Depends(check_permission("fees.read"))
):
    """
    Start a background job to generate ZIP of all student vouchers for a class.
    Use this for large classes to avoid timeout.
    
    Returns job_id to poll for status and download when ready.
    """
    try:
        # Clean up old jobs first
        cleanup_old_jobs()
        
        # Create background job
        job_id = create_voucher_job(
            job_type="zip",
            class_id=class_id,
            school_id=school_id,
            user_id=current_user.get("id", "unknown")
        )
        
        logger.info(f"[FEE_VOUCHER] Created background ZIP job {job_id} for class {class_id}")
        
        return {
            "job_id": job_id,
            "status": "pending",
            "message": "Voucher generation started. Poll /jobs/{job_id}/status for updates."
        }
        
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Failed to create ZIP job: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start job: {str(e)}")


@router.post("/class/{class_id}/print-all/background")
async def start_class_vouchers_pdf_job(
    class_id: str,
    school_id: str = Depends(check_permission("fees.read")),
    current_user = Depends(check_permission("fees.read"))
):
    """
    Start a background job to generate combined PDF of all student vouchers for a class.
    Use this for large classes to avoid timeout.
    
    Returns job_id to poll for status and download when ready.
    """
    try:
        # Clean up old jobs first
        cleanup_old_jobs()
        
        # Create background job
        job_id = create_voucher_job(
            job_type="pdf",
            class_id=class_id,
            school_id=school_id,
            user_id=current_user.get("id", "unknown")
        )
        
        logger.info(f"[FEE_VOUCHER] Created background PDF job {job_id} for class {class_id}")
        
        return {
            "job_id": job_id,
            "status": "pending",
            "message": "Voucher generation started. Poll /jobs/{job_id}/status for updates."
        }
        
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Failed to create PDF job: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start job: {str(e)}")


@router.get("/jobs/{job_id}/status")
async def get_voucher_job_status(
    job_id: str,
    _: str = Depends(check_permission("fees.read"))
):
    """
    Get the status of a voucher generation job.
    
    Possible statuses:
    - pending: Job is queued
    - processing: Job is being processed
    - completed: Job finished successfully, ready to download
    - failed: Job failed with error
    """
    try:
        status = get_job_status(job_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error checking job status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get job status: {str(e)}")


@router.get("/jobs/{job_id}/download")
async def download_voucher_job_result(
    job_id: str,
    _: str = Depends(check_permission("fees.read"))
):
    """
    Download the result of a completed voucher generation job.
    """
    try:
        # Get job status first
        status = get_job_status(job_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if status["status"] == "failed":
            raise HTTPException(status_code=500, detail=f"Job failed: {status.get('error', 'Unknown error')}")
        
        if status["status"] != "completed":
            raise HTTPException(status_code=400, detail=f"Job not completed yet. Status: {status['status']}")
        
        # Get the result data
        result_data = get_job_result(job_id)
        
        if not result_data:
            raise HTTPException(status_code=404, detail="Job result not found")
        
        # Determine content type and filename based on job type
        if status["job_type"] == "zip":
            media_type = "application/zip"
            filename = f"class_vouchers_{status['class_id']}.zip"
        else:  # pdf
            media_type = "application/pdf"
            filename = f"class_vouchers_{status['class_id']}.pdf"
        
        logger.info(f"[FEE_VOUCHER] ✅ Downloading result for job {job_id} ({len(result_data)} bytes)")
        
        return Response(
            content=result_data,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": media_type
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error downloading job result: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to download result: {str(e)}")


