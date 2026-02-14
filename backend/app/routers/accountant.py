from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.user import AccountantProfile, AccountantBalanceUpdate, AccountantDailySummary
from app.services.accountant_service import (
    create_accountant_profile, get_accountant_profile, update_accountant_balance,
    get_accountant_daily_summary, verify_daily_summary, get_accountant_transactions
)
from app.dependencies.auth import check_permission
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

router = APIRouter(prefix="/api/accountants", tags=["Accountants"])

@router.post("/profile", response_model=dict)
async def create_profile(
    current_user: dict = Depends(check_permission("accountant.manage"))
):
    """Create accountant profile for current user"""
    profile = create_accountant_profile(current_user["id"])
    if not profile:
        raise HTTPException(status_code=400, detail="Failed to create profile")
    
    return convert_objectids(profile)

@router.get("/profile", response_model=dict)
async def get_profile(
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get accountant profile for current user"""
    profile = get_accountant_profile(current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return convert_objectids(profile)

@router.post("/balance/update", response_model=dict)
async def update_balance(
    update_data: AccountantBalanceUpdate,
    current_user: dict = Depends(check_permission("accountant.manage"))
):
    """Update accountant balance"""
    success = update_accountant_balance(
        user_id=current_user["id"],
        amount=update_data.amount,
        type_=update_data.type,
        description=update_data.description,
        recorded_by=current_user["id"]
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update balance")
    
    # Return updated profile
    profile = get_accountant_profile(current_user["id"])
    return convert_objectids(profile)

@router.get("/daily-summary/{date}", response_model=dict)
async def get_daily_summary(
    date: str,
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get daily summary for current user"""
    summary = get_accountant_daily_summary(current_user["id"], date)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    return convert_objectids(summary)

@router.post("/daily-summary/{summary_id}/verify")
async def verify_summary(
    summary_id: str,
    current_user: dict = Depends(check_permission("accountant.manage"))
):
    """Verify daily summary"""
    success = verify_daily_summary(summary_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=400, detail="Failed to verify summary")
    
    return {"message": "Summary verified successfully"}

@router.get("/transactions", response_model=List[dict])
async def get_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get accountant transactions"""
    from datetime import datetime
    
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    transactions = get_accountant_transactions(current_user["id"], start, end)
    return [convert_objectids(tx) for tx in transactions]