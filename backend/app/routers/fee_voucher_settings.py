from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime
from bson import ObjectId
import logging

from app.models.fee import FeeVoucherSettingsCreate, FeeVoucherSettingsUpdate, FeeVoucherSettingsResponse
from app.dependencies.auth import check_permission
from app.database import get_db
from app.services.saas_db import get_saas_root_db, get_school_by_id

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
            # Try to fallback to SaaS root DB to get canonical school_name
            try:
                root_school = get_school_by_id(school_id)
                school_name = root_school.get('school_name') if root_school else None
            except Exception:
                school_name = None

            logger.info(f"[SCHOOL:{school_id}] No voucher settings found, returning defaults (fallback school_name={school_name})")
            return {
                "school_id": school_id,
                "header_text": "",
                "footer_text": "",
                "due_day": None,
                "school_name": school_name,
                "left_image_blob": None,
                "right_image_blob": None,
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
            "school_name": getattr(settings_data, 'school_name', None),
            "left_image_blob": getattr(settings_data, 'left_image_blob', None),
            "right_image_blob": getattr(settings_data, 'right_image_blob', None),
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

        # Also persist canonical school info into SaaS root `schools` collection
        try:
            root_db = get_saas_root_db()
            update_root = {}

            # Directly provided values from voucher settings (school_name + blobs)
            if settings_doc.get('school_name') is not None:
                # set both school_name and display/name variants where appropriate
                update_root['school_name'] = settings_doc.get('school_name')
                update_root['display_name'] = settings_doc.get('school_name')
                update_root['name'] = settings_doc.get('school_name').lower() if settings_doc.get('school_name') else None
                logger.info(f"[SCHOOL:{school_id}] [SYNC] school_name='{settings_doc.get('school_name')}'")
            if settings_doc.get('left_image_blob') is not None:
                update_root['left_image_blob'] = settings_doc.get('left_image_blob')
                logger.info(f"[SCHOOL:{school_id}] [SYNC] left_image_blob size={len(settings_doc.get('left_image_blob') or '')}")
            if settings_doc.get('right_image_blob') is not None:
                update_root['right_image_blob'] = settings_doc.get('right_image_blob')
                logger.info(f"[SCHOOL:{school_id}] [SYNC] right_image_blob size={len(settings_doc.get('right_image_blob') or '')}")

            # Try to supplement with tenant DB 'schools' document (tenant may store canonical contact info)
            try:
                tenant_school = db.schools.find_one({})
            except Exception:
                tenant_school = None

            if tenant_school:
                # Copy common fields from tenant school doc if not already provided
                for key in ('name', 'display_name', 'email', 'phone', 'address', 'city', 'state', 'country', 'postal_code', 'school_slug'):
                    if tenant_school.get(key) is not None and update_root.get(key) is None:
                        update_root[key] = tenant_school.get(key)
                        logger.info(f"[SCHOOL:{school_id}] [SYNC] from tenant: {key}='{tenant_school.get(key)}'")

            # If we have anything to update on the root record, apply it
            if update_root:
                # Try multiple match strategies to find an existing root record
                matched = False
                filters = [{"school_id": school_id}]
                if tenant_school and tenant_school.get('school_slug'):
                    filters.append({"school_slug": tenant_school.get('school_slug')})
                if tenant_school and tenant_school.get('name'):
                    filters.append({"name": tenant_school.get('name')})
                try:
                    db_name = getattr(db, 'name', None)
                    if db_name:
                        filters.append({"database_name": db_name})
                except Exception:
                    db_name = None

                for f in filters:
                    try:
                        root_result = root_db.schools.update_one(f, {"$set": update_root}, upsert=False)
                        if getattr(root_result, 'matched_count', 0) > 0:
                            logger.info(f"[SCHOOL:{school_id}] ✅ Updated saas_root_db.schools using filter {f} (matched={root_result.matched_count}, modified={root_result.modified_count})")
                            matched = True
                            break
                    except Exception as e:
                        logger.warning(f"[SCHOOL:{school_id}] Failed attempt to update saas_root_db.schools with filter {f}: {e}")

                if not matched:
                    # Fall back to upsert by school_id and include database_name on insert
                    upsert_payload = {"$set": update_root, "$setOnInsert": {"school_id": school_id}}
                    if db_name:
                        upsert_payload["$setOnInsert"]["database_name"] = db_name
                    root_result = root_db.schools.update_one({"school_id": school_id}, upsert_payload, upsert=True)
                    logger.info(f"[SCHOOL:{school_id}] ✅ Upserted saas_root_db.schools (matched={root_result.matched_count}, modified={root_result.modified_count})")
        except Exception as e:
            logger.warning(f"[SCHOOL:{school_id}] Could not update saas_root_db.schools: {e}")

        # Ensure we return the saved settings document (not the UpdateResult)
        try:
            final_doc = db.fee_voucher_settings.find_one({"school_id": school_id})
            return convert_objectids(final_doc)
        except Exception:
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
        if getattr(settings_data, 'school_name', None) is not None:
            update_data["school_name"] = settings_data.school_name
        if getattr(settings_data, 'left_image_blob', None) is not None:
            update_data["left_image_blob"] = settings_data.left_image_blob
        if getattr(settings_data, 'right_image_blob', None) is not None:
            update_data["right_image_blob"] = settings_data.right_image_blob
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
        # Also sync school_name/images to saas_root_db.schools when provided
        try:
            root_db = get_saas_root_db()
            update_root = {}
            if update_data.get('school_name') is not None:
                update_root['school_name'] = update_data.get('school_name')
                logger.info(f"[SCHOOL:{school_id}] [SYNC] school_name='{update_data.get('school_name')}'")
            if update_data.get('left_image_blob') is not None:
                update_root['left_image_blob'] = update_data.get('left_image_blob')
                logger.info(f"[SCHOOL:{school_id}] [SYNC] left_image_blob size={len(update_data.get('left_image_blob') or '')}")
            if update_data.get('right_image_blob') is not None:
                update_root['right_image_blob'] = update_data.get('right_image_blob')
                logger.info(f"[SCHOOL:{school_id}] [SYNC] right_image_blob size={len(update_data.get('right_image_blob') or '')}")

            # Supplement with tenant db school info if present
            try:
                tenant_school = db.schools.find_one({})
            except Exception:
                tenant_school = None

            if tenant_school:
                for key in ('name', 'display_name', 'email', 'phone', 'address', 'city', 'state', 'country', 'postal_code', 'school_slug'):
                    if tenant_school.get(key) is not None and update_root.get(key) is None:
                        update_root[key] = tenant_school.get(key)
                        logger.info(f"[SCHOOL:{school_id}] [SYNC] from tenant: {key}='{tenant_school.get(key)}'")

            if update_root:
                # Try multiple match strategies to find an existing root record
                matched = False
                filters = [{"school_id": school_id}]
                if tenant_school and tenant_school.get('school_slug'):
                    filters.append({"school_slug": tenant_school.get('school_slug')})
                if tenant_school and tenant_school.get('name'):
                    filters.append({"name": tenant_school.get('name')})
                try:
                    db_name = getattr(db, 'name', None)
                    if db_name:
                        filters.append({"database_name": db_name})
                except Exception:
                    db_name = None

                for f in filters:
                    try:
                        root_result = root_db.schools.update_one(f, {"$set": update_root}, upsert=False)
                        if getattr(root_result, 'matched_count', 0) > 0:
                            logger.info(f"[SCHOOL:{school_id}] ✅ Synced to saas_root_db.schools using filter {f} (matched={root_result.matched_count}, modified={root_result.modified_count})")
                            matched = True
                            break
                    except Exception as e:
                        logger.warning(f"[SCHOOL:{school_id}] Failed attempt to sync saas_root_db.schools with filter {f}: {e}")

                if not matched:
                    upsert_payload = {"$set": update_root, "$setOnInsert": {"school_id": school_id}}
                    if db_name:
                        upsert_payload["$setOnInsert"]["database_name"] = db_name
                    root_result = root_db.schools.update_one({"school_id": school_id}, upsert_payload, upsert=True)
                    logger.info(f"[SCHOOL:{school_id}] ✅ Synced (upsert) to saas_root_db.schools (matched={root_result.matched_count}, modified={root_result.modified_count})")
        except Exception as e:
            logger.warning(f"[SCHOOL:{school_id}] Could not sync to saas_root_db.schools: {e}")

        # result is the updated settings document returned by find_one_and_update
        return convert_objectids(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Error updating voucher settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update voucher settings")
