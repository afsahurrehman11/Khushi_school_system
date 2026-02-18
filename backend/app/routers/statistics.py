"""
Fee Statistics Router
Provides aggregated statistics for accountants and admins
"""
from fastapi import APIRouter, Depends, HTTPException
import logging
from app.services.fee_statistics_service import (
    get_fee_collection_stats,
    get_payment_method_breakdown,
    get_daily_collections
)
from app.dependencies.auth import check_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/statistics", tags=["Statistics"])


@router.get("/fee-collection")
async def get_fee_collection_statistics(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get comprehensive fee collection statistics
    - Total students and fee status breakdown
    - Collection amounts and rates
    - Breakdown by class
    - Recent payments
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[STATISTICS] User {email} requesting fee collection stats")
    
    try:
        stats = get_fee_collection_stats(school_id)
        logger.info(f"[STATISTICS] ✅ Retrieved fee collection stats")
        return stats
    except Exception as e:
        logger.error(f"[STATISTICS] ❌ Failed to get stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")


@router.get("/payment-methods")
async def get_payment_methods_breakdown(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get breakdown of payments by payment method
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[STATISTICS] User {email} requesting payment method breakdown")
    
    try:
        breakdown = get_payment_method_breakdown(school_id)
        logger.info(f"[STATISTICS] ✅ Retrieved payment method breakdown")
        return breakdown
    except Exception as e:
        logger.error(f"[STATISTICS] ❌ Failed to get breakdown: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve breakdown")


@router.get("/daily-collections")
async def get_daily_collections_history(
    days: int = 30,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """
    Get daily collection history for the last N days
    """
    school_id = current_user.get("school_id")
    email = current_user.get("email")
    
    logger.info(f"[STATISTICS] User {email} requesting daily collections for {days} days")
    
    try:
        collections = get_daily_collections(school_id, days)
        logger.info(f"[STATISTICS] ✅ Retrieved daily collections")
        return collections
    except Exception as e:
        logger.error(f"[STATISTICS] ❌ Failed to get collections: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve collections")
