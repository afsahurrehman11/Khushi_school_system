from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.models.user import AccountantProfile, AccountantBalanceUpdate, AccountantDailySummary
from app.services.accountant_service import (
    create_accountant_profile, get_accountant_profile, update_accountant_balance,
    get_accountant_daily_summary, verify_daily_summary, get_accountant_transactions
)
from app.dependencies.auth import check_permission
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

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
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating accountant profile")
    
    try:
        profile = create_accountant_profile(current_user["id"], school_id=school_id)
        if not profile:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create profile")
            raise HTTPException(status_code=400, detail="Failed to create profile")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Profile created successfully")
        return convert_objectids(profile)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {str(e)}")

@router.get("/profile", response_model=dict)
async def get_profile(
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get accountant profile for current user"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Retrieving accountant profile")
    
    try:
        profile = get_accountant_profile(current_user["id"], school_id=school_id)
        if not profile:
            logger.error(f"[SCHOOL:{school_id}] ❌ Profile not found")
            raise HTTPException(status_code=404, detail="Profile not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Profile retrieved successfully")
        return convert_objectids(profile)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to retrieve profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve profile: {str(e)}")

@router.post("/balance/update", response_model=dict)
async def update_balance(
    update_data: AccountantBalanceUpdate,
    current_user: dict = Depends(check_permission("accountant.manage"))
):
    """Update accountant balance"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating balance: amount={update_data.amount}, type={update_data.type}")
    
    try:
        success = update_accountant_balance(
            user_id=current_user["id"],
            amount=update_data.amount,
            type_=update_data.type,
            description=update_data.description,
            recorded_by=current_user["id"],
            school_id=school_id
        )
        
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update balance")
            raise HTTPException(status_code=400, detail="Failed to update balance")
        
        # Return updated profile
        profile = get_accountant_profile(current_user["id"], school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Balance updated successfully")
        return convert_objectids(profile)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update balance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Balance update failed: {str(e)}")

@router.get("/daily-summary/{date}", response_model=dict)
async def get_daily_summary(
    date: str,
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get daily summary for current user"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Retrieving daily summary for {date}")
    
    try:
        summary = get_accountant_daily_summary(current_user["id"], date, school_id=school_id)
        if not summary:
            logger.error(f"[SCHOOL:{school_id}] ❌ Summary not found for {date}")
            raise HTTPException(status_code=404, detail="Summary not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Daily summary retrieved successfully")
        return convert_objectids(summary)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to retrieve summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve summary: {str(e)}")

@router.post("/daily-summary/{summary_id}/verify")
async def verify_summary(
    summary_id: str,
    current_user: dict = Depends(check_permission("accountant.manage"))
):
    """Verify daily summary"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Verifying daily summary {summary_id}")
    
    try:
        success = verify_daily_summary(summary_id, current_user["id"], school_id=school_id)
        if not success:
            logger.error(f"[SCHOOL:{school_id}] ❌ Failed to verify summary")
            raise HTTPException(status_code=400, detail="Failed to verify summary")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Summary verified successfully")
        return {"message": "Summary verified successfully"}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to verify summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Summary verification failed: {str(e)}")

@router.get("/transactions", response_model=List[dict])
async def get_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(check_permission("accountant.view"))
):
    """Get accountant transactions"""
    from datetime import datetime
    
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Retrieving transactions from {start_date} to {end_date}")
    
    try:
        start = datetime.fromisoformat(start_date) if start_date else None
        end = datetime.fromisoformat(end_date) if end_date else None
        
        transactions = get_accountant_transactions(current_user["id"], start, end, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(transactions)} transactions")
        return [convert_objectids(tx) for tx in transactions]
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to retrieve transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")