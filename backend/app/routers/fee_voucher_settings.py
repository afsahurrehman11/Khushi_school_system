from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime
from bson import ObjectId
import logging

from app.models.fee import FeeVoucherSettingsCreate, FeeVoucherSettingsUpdate, FeeVoucherSettingsResponse
from app.dependencies.auth import check_permission
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fee-voucher-settings", tags=["Fee Voucher Settings"])


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


@router.get("", response_model=dict)
async def get_voucher_settings(
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee voucher settings for the school"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Fetching voucher settings")
    
    try:
        db = get_db()
        settings = db.fee_voucher_settings.find_one({"school_id": school_id})
        
        if not settings:
            # Return default empty settings
            logger.info(f"[SCHOOL:{school_id}] No voucher settings found, returning defaults")
            return {
                "school_id": school_id,
                "header_text": "",
                "footer_text": "",
                "due_day": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved voucher settings")
        return convert_objectids(settings)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error fetching voucher settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch voucher settings")


@router.post("", response_model=dict)
async def create_or_update_voucher_settings(
    settings_data: FeeVoucherSettingsCreate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Create or update fee voucher settings"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating voucher settings")
    
    try:
        db = get_db()
        
        # Check if settings already exist
        existing = db.fee_voucher_settings.find_one({"school_id": school_id})
        
        settings_doc = {
            "school_id": school_id,
            "header_text": settings_data.header_text or "",
            "footer_text": settings_data.footer_text or "",
            "due_day": int(settings_data.due_day) if getattr(settings_data, 'due_day', None) is not None else None,
            "updated_at": datetime.now()
        }
        
        if existing:
            # Update existing settings
            db.fee_voucher_settings.update_one(
                {"school_id": school_id},
                {"$set": settings_doc}
            )
            result = db.fee_voucher_settings.find_one({"school_id": school_id})
            logger.info(f"[SCHOOL:{school_id}] ✅ Updated voucher settings")
        else:
            # Create new settings
            settings_doc["created_at"] = datetime.now()
            result = db.fee_voucher_settings.insert_one(settings_doc)
            settings_doc["_id"] = result.inserted_id
            result = settings_doc
            logger.info(f"[SCHOOL:{school_id}] ✅ Created voucher settings")
        
        return convert_objectids(result)
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error saving voucher settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save voucher settings")


@router.put("", response_model=dict)
async def update_voucher_settings(
    settings_data: FeeVoucherSettingsUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update fee voucher settings"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating voucher settings")
    
    try:
        db = get_db()
        
        # Build update dict
        update_data = {"updated_at": datetime.now()}
        if settings_data.header_text is not None:
            update_data["header_text"] = settings_data.header_text
        if settings_data.footer_text is not None:
            update_data["footer_text"] = settings_data.footer_text
        if getattr(settings_data, 'due_day', None) is not None:
            update_data["due_day"] = int(settings_data.due_day)
        
        # Update existing settings or create if not exists
        result = db.fee_voucher_settings.find_one_and_update(
            {"school_id": school_id},
            {"$set": update_data},
            upsert=True,
            return_document=True
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Failed to update settings")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Updated voucher settings")
        return convert_objectids(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error updating voucher settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update voucher settings")
