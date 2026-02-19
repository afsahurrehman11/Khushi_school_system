"""
WhatsApp Bot & Alerts API Router

Provides endpoints for:
- Sending WhatsApp messages to students/parents
- Managing message templates
- Checking connection status
- Scheduling messages
- Viewing message logs
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from bson.objectid import ObjectId
import logging

from app.dependencies.auth import check_permission, get_current_user
from app.database import get_db
from app.services.whatsapp_service import (
    WhatsAppService,
    WhatsAppTemplateService,
    WhatsAppLogService
)
from app.models.whatsapp_log import (
    SendMessageRequest,
    WhatsAppStatusResponse,
    WhatsAppTemplateSchema
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp"])


@router.get("/status")
async def get_whatsapp_status(
    current_user: dict = Depends(check_permission("whatsapp.view"))
):
    """
    Get WhatsApp Business API connection status
    
    Returns:
        Connection status and details
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 🔍 Checking WhatsApp status")
    
    try:
        status = await WhatsAppService.get_connection_status()
        return status
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Status check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check status: {str(e)}")


@router.post("/reconnect")
async def reconnect_whatsapp(
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Attempt to reconnect WhatsApp API
    
    Returns:
        Reconnection result and new status
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 🔄 Attempting WhatsApp reconnection")
    
    try:
        result = await WhatsAppService.reconnect()
        
        if result.get("success"):
            logger.info(f"[SCHOOL:{school_id}] ✅ WhatsApp reconnected")
        else:
            logger.warning(f"[SCHOOL:{school_id}] ⚠️ Reconnection failed")
        
        return result
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Reconnection error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reconnection failed: {str(e)}")


@router.post("/send")
async def send_whatsapp_message(
    request: SendMessageRequest,
    current_user: dict = Depends(check_permission("whatsapp.send"))
):
    """
    Send WhatsApp message to selected recipients
    
    Supports:
    - Entire school
    - Specific class
    - Specific section
    - Selected students
    
    Optionally schedules message for later delivery.
    Only sends to students with whatsappOptIn = true.
    """
    school_id = current_user.get("school_id")
    sent_by = current_user.get("email", "unknown")
    
    logger.info(f"[SCHOOL:{school_id}] 📱 Sending WhatsApp message - type={request.recipient_type}")
    
    try:
        db = get_db()
        
        # Build query based on recipient type
        query = {"school_id": school_id}
        
        # Only include students who have opted in
        # Check for whatsapp_opt_in field (default to True if not present for backwards compatibility)
        opt_in_query = {"$or": [
            {"whatsapp_opt_in": True},
            {"whatsapp_opt_in": {"$exists": False}}  # Default opt-in if field doesn't exist
        ]}
        
        if request.recipient_type == "specific_students":
            if not request.student_ids:
                raise HTTPException(status_code=400, detail="No students selected")
            
            # Convert string IDs to ObjectId
            try:
                object_ids = [ObjectId(sid) for sid in request.student_ids]
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid student IDs")
            
            query["_id"] = {"$in": object_ids}
            
        elif request.recipient_type == "specific_section":
            if not request.class_id:
                raise HTTPException(status_code=400, detail="Class ID required")
            query["class_id"] = request.class_id
            if request.section_id:
                query["section"] = request.section_id
                
        elif request.recipient_type == "specific_class":
            if not request.class_id:
                raise HTTPException(status_code=400, detail="Class ID required")
            query["class_id"] = request.class_id
            
        elif request.recipient_type == "entire_school":
            pass  # Just use school_id filter
        else:
            raise HTTPException(status_code=400, detail="Invalid recipient type")
        
        # Merge opt-in condition
        query = {"$and": [query, opt_in_query]}
        
        # Fetch students with their phone numbers
        students = list(db.students.find(query, {
            "_id": 1,
            "full_name": 1,
            "class_id": 1,
            "section": 1,
            "guardian_info": 1,
            "contact_info": 1
        }))
        
        if not students:
            raise HTTPException(status_code=400, detail="No eligible recipients found")
        
        # Extract phone numbers from guardian_info
        phone_list = []
        student_ids = []
        for student in students:
            guardian = student.get("guardian_info", {}) or {}
            phone = guardian.get("guardian_contact") or guardian.get("guardian_phone")
            
            # Fallback to contact_info if no guardian phone
            if not phone:
                contact = student.get("contact_info", {}) or {}
                phone = contact.get("phone")
            
            if phone:
                # Validate phone
                is_valid, normalized = WhatsAppService.validate_phone_number(phone)
                if is_valid:
                    phone_list.append(normalized)
                    student_ids.append(str(student["_id"]))
        
        if not phone_list:
            raise HTTPException(status_code=400, detail="No valid phone numbers found for selected recipients")
        
        logger.info(f"[SCHOOL:{school_id}] 📋 Found {len(phone_list)} valid phone numbers out of {len(students)} students")
        
        # Create log entry
        log_data = {
            "school_id": school_id,
            "message": request.message,
            "template_type": request.template_type,
            "recipient_type": request.recipient_type,
            "class_id": request.class_id,
            "section_id": request.section_id,
            "student_ids": student_ids,
            "recipient_phones": phone_list,
            "recipients_count": len(phone_list),
            "sent_by": sent_by,
            "status": "pending"
        }
        
        # Handle scheduling
        if request.schedule_time:
            if request.schedule_time <= datetime.utcnow():
                raise HTTPException(status_code=400, detail="Schedule time must be in the future")
            
            result = await WhatsAppService.schedule_message(
                phone_list=phone_list,
                message=request.message,
                schedule_time=request.schedule_time,
                school_id=school_id,
                sent_by=sent_by
            )
            
            logger.info(f"[SCHOOL:{school_id}] 📅 Message scheduled for {request.schedule_time.isoformat()}")
            
            return {
                "success": True,
                "scheduled": True,
                "scheduled_for": request.schedule_time.isoformat(),
                "recipient_count": len(phone_list),
                **result
            }
        
        # Send immediately
        log_entry = WhatsAppLogService.create_log(log_data)
        
        try:
            result = await WhatsAppService.send_bulk_messages(
                phone_list=phone_list,
                message=request.message,
                school_id=school_id,
                sent_by=sent_by
            )
            
            # Update log status
            if result["failed"] == 0 and result["invalid"] == 0:
                WhatsAppLogService.update_log_status(log_entry["id"], "sent")
            elif result["success"] > 0:
                WhatsAppLogService.update_log_status(log_entry["id"], "partial")
            else:
                WhatsAppLogService.update_log_status(log_entry["id"], "failed")
            
            logger.info(f"[SCHOOL:{school_id}] ✅ Bulk send complete: {result['success']} success, {result['failed']} failed")
            
            return {
                "success": True,
                "log_id": log_entry["id"],
                **result
            }
            
        except Exception as e:
            WhatsAppLogService.update_log_status(log_entry["id"], "failed", str(e))
            raise
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")


@router.get("/templates")
async def get_templates(
    current_user: dict = Depends(check_permission("whatsapp.view"))
):
    """
    Get all available message templates
    
    Returns both default and custom templates for the school.
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 📑 Fetching WhatsApp templates")
    
    try:
        templates = WhatsAppTemplateService.get_templates(school_id)
        return {"templates": templates}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch templates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")


@router.post("/templates")
async def create_template(
    template: dict,
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Create a new custom message template
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 📝 Creating WhatsApp template: {template.get('name')}")
    
    try:
        result = WhatsAppTemplateService.create_template(template, school_id)
        logger.info(f"[SCHOOL:{school_id}] ✅ Template created: {result.get('name')}")
        return result
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    template: dict,
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Update an existing custom template
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 📝 Updating WhatsApp template: {template_id}")
    
    try:
        result = WhatsAppTemplateService.update_template(template_id, template, school_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Template not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Template updated: {template_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Delete a custom template
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 🗑️ Deleting WhatsApp template: {template_id}")
    
    try:
        success = WhatsAppTemplateService.delete_template(template_id, school_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Template not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Template deleted: {template_id}")
        return {"success": True, "message": "Template deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(e)}")


@router.get("/logs")
async def get_message_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(check_permission("whatsapp.view"))
):
    """
    Get message history/logs
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 📜 Fetching WhatsApp logs")
    
    try:
        logs = WhatsAppLogService.get_logs(school_id, skip, limit)
        return {"logs": logs, "skip": skip, "limit": limit}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch logs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {str(e)}")


@router.get("/stats")
async def get_message_stats(
    current_user: dict = Depends(check_permission("whatsapp.view"))
):
    """
    Get message statistics
    """
    school_id = current_user.get("school_id")
    logger.info(f"[SCHOOL:{school_id}] 📊 Fetching WhatsApp stats")
    
    try:
        stats = WhatsAppLogService.get_log_stats(school_id)
        return stats
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")


@router.get("/recipients")
async def get_potential_recipients(
    recipient_type: str = Query(..., description="entire_school, specific_class, specific_section"),
    class_id: Optional[str] = Query(None),
    section_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(check_permission("whatsapp.view"))
):
    """
    Get list of potential recipients based on filters
    
    This endpoint helps the UI show recipient counts and lists.
    """
    school_id = current_user.get("school_id")
    
    try:
        db = get_db()
        query = {"school_id": school_id}
        
        if recipient_type == "specific_class" and class_id:
            query["class_id"] = class_id
        elif recipient_type == "specific_section" and class_id:
            query["class_id"] = class_id
            if section_id:
                query["section"] = section_id
        
        # Apply search filter
        if search:
            query["$or"] = [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"student_id": {"$regex": search, "$options": "i"}}
            ]
        
        students = list(db.students.find(query, {
            "_id": 1,
            "student_id": 1,
            "full_name": 1,
            "class_id": 1,
            "section": 1,
            "guardian_info": 1,
            "contact_info": 1,
            "whatsapp_opt_in": 1
        }).limit(500))
        
        # Process and return
        result = []
        for student in students:
            guardian = student.get("guardian_info", {}) or {}
            phone = guardian.get("guardian_contact") or guardian.get("guardian_phone")
            
            if not phone:
                contact = student.get("contact_info", {}) or {}
                phone = contact.get("phone")
            
            is_valid, _ = WhatsAppService.validate_phone_number(phone) if phone else (False, "")
            
            result.append({
                "id": str(student["_id"]),
                "student_id": student.get("student_id"),
                "full_name": student.get("full_name"),
                "class_id": student.get("class_id"),
                "section": student.get("section"),
                "parent_phone": phone or "N/A",
                "phone_valid": is_valid,
                "whatsapp_opt_in": student.get("whatsapp_opt_in", True)
            })
        
        valid_count = sum(1 for r in result if r["phone_valid"] and r["whatsapp_opt_in"])
        
        return {
            "recipients": result,
            "total": len(result),
            "valid_phone_count": valid_count
        }
        
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to fetch recipients: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch recipients: {str(e)}")


# ================ Future Automation Structure ================
# TODO: Implement these endpoints when automation is ready

@router.get("/automation")
async def get_automation_rules(
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Get automation rules (coming soon)
    
    Will support:
    - Auto Fee Reminder
    - Daily Attendance Alert
    - Exam Schedule Auto Send
    """
    return {
        "message": "Automation feature coming soon",
        "available_automations": [
            {
                "type": "fee_reminder",
                "name": "Automatic Fee Reminder",
                "description": "Send fee reminders X days before due date",
                "status": "coming_soon"
            },
            {
                "type": "attendance_alert",
                "name": "Daily Attendance Alert",
                "description": "Send absent notifications to parents daily",
                "status": "coming_soon"
            },
            {
                "type": "exam_reminder",
                "name": "Exam Schedule Alert",
                "description": "Send exam reminders before exam dates",
                "status": "coming_soon"
            }
        ]
    }


@router.post("/automation")
async def create_automation_rule(
    rule: dict,
    current_user: dict = Depends(check_permission("whatsapp.manage"))
):
    """
    Create automation rule (coming soon)
    """
    return {
        "message": "Automation feature coming soon",
        "status": "not_implemented"
    }
