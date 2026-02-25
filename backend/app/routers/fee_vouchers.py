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

from app.dependencies.auth import check_permission
from app.services.fee_voucher_service import FeeVoucherService, get_classes_with_fee_summary
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
        logger.error(f"Error getting preview data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
