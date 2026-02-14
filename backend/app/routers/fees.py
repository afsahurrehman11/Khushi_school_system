from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.fee import FeeCreate, FeeInDB, FeeUpdate, FeeGenerate
from app.services.fee import (
    get_all_fees, get_fee_by_id, create_fee, update_fee, delete_fee, get_fees_by_student
)
from app.services.student import get_all_students
from app.dependencies.auth import check_permission
from app.database import get_db
from typing import Dict
from bson import ObjectId

def convert_objectids(obj):
    """Recursively convert ObjectId to string in dict/list"""
    if isinstance(obj, dict):
        return {k: convert_objectids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

router = APIRouter()

@router.get("/fees")
async def get_fees(
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fees with optional filters and pagination. Returns {count, page, page_size, fees}"""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = student_id
    if status:
        query["status"] = status

    # sanitize paging
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 500:
        page_size = 20

    total = db.fees.count_documents(query)
    sd = -1 if sort_dir.lower() == "desc" else 1
    cursor = db.fees.find(query).sort(sort_by, sd).skip((page - 1) * page_size).limit(page_size)
    fees = list(cursor)
    fees = [convert_objectids(fee) for fee in fees]
    for f in fees:
        f["id"] = f.pop("_id", None)

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "fees": fees,
    }





@router.get("/fees/search", response_model=List[FeeInDB])
async def search_fees(
    student_name: Optional[str] = None,
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Search fees by student name, class, and/or status"""
    filters: Dict = {}
    if class_id:
        filters["class_id"] = class_id
    if status:
        filters["status"] = status

    # If student_name provided, find matching students then filter by their student_id
    if student_name:
        students = get_all_students({"full_name": {"$regex": student_name, "$options": "i"}})
        if students:
            student_ids = [s.get("student_id") for s in students if s.get("student_id")]
            if student_ids:
                filters["student_id"] = {"$in": student_ids}
            else:
                # no matching student ids -> return empty list
                return []
        else:
            return []

    fees = get_all_fees(filters)
    return fees

@router.get("/fees/{fee_id}", response_model=FeeInDB)
async def get_fee(
    fee_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee by ID"""
    fee = get_fee_by_id(fee_id)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee not found")
    return fee

@router.get("/students/{student_id}/fees", response_model=List[FeeInDB])
async def get_student_fees(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fees for a specific student"""
    fees = get_fees_by_student(student_id)
    return fees

@router.post("/fees", response_model=FeeInDB)
async def create_new_fee(
    fee_data: FeeCreate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Create new fee"""
    fee_dict = fee_data.dict()
    fee_dict["generated_by"] = current_user["id"]  # Set the user who created the fee
    fee = create_fee(fee_dict)
    return fee

@router.post("/fees/generate")
async def generate_fees(
    fee_data: FeeGenerate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Generate fees for multiple students"""
    students = get_all_students({"class_id": fee_data.class_id}) if hasattr(fee_data, 'class_id') else []

    created_fees = []
    for student in students:
        fee_dict = {
            "student_id": student["student_id"],
            "class_id": student["class_id"],
            "fee_type": fee_data.fee_type,
            "amount": fee_data.amount,
            "due_date": fee_data.due_date,
            "status": "pending",
            "generated_by": current_user["id"]
        }
        fee = create_fee(fee_dict)
        if fee:
            created_fees.append(fee)

    return {"count": len(created_fees), "fees": created_fees}

@router.put("/fees/{fee_id}", response_model=FeeInDB)
async def update_existing_fee(
    fee_id: str,
    fee_data: FeeUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update fee"""
    update_data = fee_data.dict(exclude_unset=True)
    fee = update_fee(fee_id, **update_data)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee not found")
    return fee

@router.delete("/fees/{fee_id}")
async def delete_existing_fee(
    fee_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Delete fee"""
    if not delete_fee(fee_id):
        raise HTTPException(status_code=404, detail="Fee not found")
    return {"message": "Fee deleted successfully"}