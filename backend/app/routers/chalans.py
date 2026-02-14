from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import get_current_user
from app.models.chalan import (
    ChalanSchema, ChalanCreate, ChalanBulkCreate, ChalanUpdate, ChalanResponse
)
from app.services.chalan import (
    create_chalan, get_all_challans, get_chalan_by_id,
    update_chalan, delete_chalan, get_chalans_by_student,
    create_chalan_from_category, create_bulk_challans_from_category,
    get_chalans_by_class, get_challans_by_status, search_challans
)
from typing import List, Optional

router = APIRouter(prefix="/api/chalans", tags=["Chalans"])

@router.get("")
async def list_challans(
    student_id: Optional[str] = None,
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    """Get challans with optional filters, pagination and sorting. Returns {count, page, page_size, challans}"""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = student_id
    if class_id:
        query["class_id"] = class_id
    if status:
        query["status"] = status

    # sanitize paging
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 1000:
        page_size = 20

    # determine sort direction
    sd = -1 if sort_dir.lower() == "desc" else 1

    total = db.student_challans.count_documents(query)
    cursor = db.student_challans.find(query).sort(sort_by, sd).skip((page - 1) * page_size).limit(page_size)
    challans = list(cursor)
    for c in challans:
        c["id"] = str(c.get("_id"))

    return {"count": total, "page": page, "page_size": page_size, "challans": challans}

@router.get("/{chalan_id}")
async def get_chalan(chalan_id: str, current_user: dict = Depends(get_current_user)):
    """Get chalan by ID"""
    chalan = get_chalan_by_id(chalan_id)
    if not chalan:
        raise HTTPException(status_code=404, detail="Chalan not found")
    return chalan

@router.post("")
async def create_new_chalan(chalan: ChalanSchema, current_user: dict = Depends(get_current_user)):
    """Create a new chalan (legacy method)"""
    chalan_data = chalan.dict()
    result = create_chalan(chalan_data)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create chalan")
    return result

@router.post("/from-category")
async def create_chalan_from_fee_category(
    chalan: ChalanCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create challan from fee category"""
    data = chalan.dict()
    data["created_by"] = current_user.get("id")
    
    result = create_chalan_from_category(data)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create chalan from category")
    return result

@router.post("/batch/from-category")
async def create_bulk_challans_from_category_route(
    data: ChalanBulkCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create challans for multiple students from fee category"""
    results = create_bulk_challans_from_category(
        class_id=data.class_id,
        student_ids=data.student_ids,
        category_id=data.category_id,
        due_date=data.due_date,
        issue_date=data.issue_date
    )
    
    if not results:
        raise HTTPException(status_code=400, detail="Failed to create challans")
    
    return {"created": len(results), "challans": results}

@router.get("/search")
async def search_challans_route(
    student_name: Optional[str] = None,
    roll_number: Optional[str] = None,
    class_id: Optional[str] = None,
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    """Search challans with multiple criteria, pagination and sorting"""
    filters = {}
    if student_name:
        filters["student_name"] = {"$regex": student_name, "$options": "i"}
    if roll_number:
        filters["student_roll"] = roll_number
    if class_id:
        filters["class_id"] = class_id
    if category_id:
        filters["category_id"] = category_id
    if status:
        filters["status"] = status

    # Date range filtering (prefer issue_date field)
    date_query = {}
    if date_from:
        date_query["$gte"] = date_from
    if date_to:
        date_query["$lte"] = date_to
    if date_query:
        filters["issue_date"] = date_query

    db = get_db()
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 1000:
        page_size = 20
    sd = -1 if sort_dir.lower() == "desc" else 1

    total = db.student_challans.count_documents(filters)
    cursor = db.student_challans.find(filters).sort(sort_by, sd).skip((page - 1) * page_size).limit(page_size)
    challans = list(cursor)
    for c in challans:
        c["id"] = str(c.get("_id"))

    return {"count": total, "page": page, "page_size": page_size, "challans": challans}

@router.put("/{chalan_id}")
async def update_existing_chalan(
    chalan_id: str,
    chalan: ChalanUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing chalan"""
    chalan_data = chalan.dict(exclude_unset=True)
    result = update_chalan(chalan_id, chalan_data)
    if not result:
        raise HTTPException(status_code=404, detail="Chalan not found")
    return result

@router.delete("/{chalan_id}")
async def delete_existing_chalan(chalan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a chalan"""
    success = delete_chalan(chalan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chalan not found")
    return {"message": "Chalan deleted successfully"}

@router.get("/student/{student_id}")
async def get_student_chalans(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get all chalans for a specific student"""
    chalans = get_chalans_by_student(student_id)
    return chalans

@router.get("/class/{class_id}")
async def get_class_chalans(class_id: str, current_user: dict = Depends(get_current_user)):
    """Get all chalans for a class"""
    chalans = get_chalans_by_class(class_id)
