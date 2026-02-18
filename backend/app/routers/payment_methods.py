from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies.auth import check_permission
from app.services.payment_method_service import create_or_get_payment_method, list_payment_methods
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payment-methods", tags=["Payment Methods"])


@router.get("", response_model=List[dict])
async def get_payment_methods(current_user: dict = Depends(check_permission("fees.view"))):
    """Get all payment methods"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Listing payment methods")
    
    try:
        methods = list_payment_methods()
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(methods)} payment methods")
        return methods
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to list payment methods: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list payment methods")


@router.post("", response_model=dict)
async def post_payment_method(payload: dict, current_user: dict = Depends(check_permission("fees.manage"))):
    """Create or get payment method"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating payment method")
    
    try:
        name = payload.get("name")
        if not name:
            logger.error(f"[SCHOOL:{school_id}] ❌ Payment method name required")
            raise HTTPException(status_code=400, detail="Payment method name required")
        
        method = create_or_get_payment_method(name)
        logger.info(f"[SCHOOL:{school_id}] ✅ Created/retrieved payment method {name}")
        return method
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error creating payment method: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create payment method")
