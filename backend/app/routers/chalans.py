from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import check_permission
from app.models.chalan import (
    ChalanSchema, ChalanCreate, ChalanBulkCreate, ChalanUpdate, ChalanResponse
)
from app.services.chalan import (
    create_chalan, get_all_challans, get_chalan_by_id,
    update_chalan, delete_chalan, get_chalans_by_student,
    create_chalan_from_category, create_bulk_challans_from_category,
    get_chalans_by_class, get_challans_by_status, search_challans
)
from app.database import get_db
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)
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
    current_user: dict = Depends(check_permission("chalans.view"))
):
    """Get challans with optional filters, pagination and sorting. Returns {count, page, page_size, challans}"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching chalans list")
    
    try:
        query = {"school_id": school_id} if school_id else {}
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

        db = get_db()
        total = db.student_challans.count_documents(query)
        cursor = db.student_challans.find(query).sort(sort_by, sd).skip((page - 1) * page_size).limit(page_size)
        challans = list(cursor)
        for c in challans:
            c["id"] = str(c.get("_id"))

        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(challans)} challans")
        return {"count": total, "page": page, "page_size": page_size, "challans": challans}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch challans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch challans")

@router.get("/{chalan_id}")
async def get_chalan(chalan_id: str, current_user: dict = Depends(check_permission("chalans.view"))):
    """Get chalan by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching chalan {chalan_id}")
    
    try:
        chalan = get_chalan_by_id(chalan_id, school_id=school_id)
        if not chalan:
            logger.error(f"[SCHOOL:{school_id}] ❌ Chalan {chalan_id} not found")
            raise HTTPException(status_code=404, detail="Chalan not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved chalan {chalan_id}")
        return chalan
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch chalan: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch chalan")

@router.post("")
async def create_new_chalan(chalan: ChalanSchema, current_user: dict = Depends(check_permission("chalans.create"))):
    """Create a new chalan (legacy method)"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating new chalan")
    
    try:
        chalan_data = chalan.dict()
        result = create_chalan(chalan_data, school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create chalan")
            raise HTTPException(status_code=400, detail="Failed to create chalan")
        logger.info(f"[SCHOOL:{school_id}] ✅ Created chalan successfully")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error creating chalan: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create chalan")

@router.post("/from-category")
async def create_chalan_from_fee_category(
    chalan: ChalanCreate,
    current_user: dict = Depends(check_permission("chalans.create"))
):
    """Create challan from fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating chalan from fee category")
    
    try:
        data = chalan.dict()
        data["created_by"] = current_user.get("id")
        
        result = create_chalan_from_category(data, school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create chalan from category")
            raise HTTPException(status_code=400, detail="Failed to create chalan from category")
        logger.info(f"[SCHOOL:{school_id}] ✅ Created chalan from category successfully")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error creating chalan from category: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create chalan from category")

@router.post("/batch/from-category")
async def create_bulk_challans_from_category_route(
    data: ChalanBulkCreate,
    current_user: dict = Depends(check_permission("chalans.create"))
):
    """Create challans for multiple students from fee category"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating bulk challans from category")
    
    try:
        results = create_bulk_challans_from_category(
            class_id=data.class_id,
            student_ids=data.student_ids,
            category_id=data.category_id,
            due_date=data.due_date,
            issue_date=data.issue_date,
            school_id=school_id
        )
        
        if not results:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create bulk challans")
            raise HTTPException(status_code=400, detail="Failed to create challans")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Created {len(results)} bulk challans")
        return {"created": len(results), "challans": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error creating bulk challans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create challans")

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
    current_user: dict = Depends(check_permission("chalans.view"))
):
    """Search challans with multiple criteria, pagination and sorting"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Searching challans")
    
    try:
        filters = {"school_id": school_id} if school_id else {}
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

        logger.info(f"[SCHOOL:{school_id}] ✅ Found {len(challans)} challans")
        return {"count": total, "page": page, "page_size": page_size, "challans": challans}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search challans")

@router.put("/{chalan_id}")
async def update_existing_chalan(
    chalan_id: str,
    chalan: ChalanUpdate,
    current_user: dict = Depends(check_permission("chalans.edit"))
):
    """Update an existing chalan"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating chalan {chalan_id}")
    
    try:
        chalan_data = chalan.dict(exclude_unset=True)
        result = update_chalan(chalan_id, chalan_data, school_id=school_id)
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Chalan {chalan_id} not found")
            raise HTTPException(status_code=404, detail="Chalan not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated chalan {chalan_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update chalan: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update chalan")

@router.delete("/{chalan_id}")
async def delete_existing_chalan(chalan_id: str, current_user: dict = Depends(check_permission("chalans.delete"))):
    """Delete a chalan"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting chalan {chalan_id}")
    
    try:
        success = delete_chalan(chalan_id, school_id=school_id)
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ Chalan {chalan_id} not found")
            raise HTTPException(status_code=404, detail="Chalan not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Deleted chalan {chalan_id}")
        return {"message": "Chalan deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete chalan: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete chalan")

@router.get("/student/{student_id}")
async def get_student_chalans(student_id: str, current_user: dict = Depends(check_permission("chalans.view"))):
    """Get all chalans for a specific student"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching chalans for student {student_id}")
    
    try:
        chalans = get_chalans_by_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(chalans or [])} chalans for student")
        return chalans
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch student chalans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch student chalans")

@router.get("/class/{class_id}")
async def get_class_chalans(class_id: str, current_user: dict = Depends(check_permission("chalans.view"))):
    """Get all chalans for a class"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching chalans for class {class_id}")
    
    try:
        chalans = get_chalans_by_class(class_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(chalans or [])} chalans for class")
        return chalans
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch class chalans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch class chalans")
