"""
WhatsApp Service - Handles WhatsApp Cloud API integration

This service provides methods to send WhatsApp messages using the WhatsApp Cloud API.
Configure the following environment variables:
- WHATSAPP_API_KEY: Your WhatsApp Cloud API access token
- WHATSAPP_PHONE_NUMBER_ID: Your WhatsApp Business phone number ID
- WHATSAPP_BUSINESS_ACCOUNT_ID: Your WhatsApp Business Account ID

TODO: Implement actual WhatsApp Cloud API integration
Currently uses placeholder logic for development/testing.
"""
import os
import logging
import re
from typing import List, Optional, Tuple
from datetime import datetime
from bson.objectid import ObjectId

from app.database import get_db
from app.config import settings

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for managing WhatsApp messaging"""
    
    # Load from environment (DO NOT HARDCODE)
    API_KEY = os.environ.get("WHATSAPP_API_KEY", "")
    PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    BUSINESS_ACCOUNT_ID = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
    
    # WhatsApp Cloud API base URL
    API_BASE_URL = "https://graph.facebook.com/v18.0"
    
    @classmethod
    def is_configured(cls) -> bool:
        """Check if WhatsApp API credentials are configured"""
        return bool(cls.API_KEY and cls.PHONE_NUMBER_ID)
    
    @staticmethod
    def validate_phone_number(phone: str) -> Tuple[bool, str]:
        """
        Validate and normalize phone number for WhatsApp
        
        Args:
            phone: Raw phone number string
            
        Returns:
            Tuple of (is_valid, normalized_phone)
        """
        if not phone:
            return False, ""
        
        # Remove all non-digit characters except leading +
        cleaned = re.sub(r'[^\d+]', '', phone)
        
        # Remove leading + if present
        if cleaned.startswith('+'):
            cleaned = cleaned[1:]
        
        # Pakistan number handling (add country code if missing)
        if cleaned.startswith('03') and len(cleaned) == 11:
            cleaned = '92' + cleaned[1:]  # Convert 03XX to 923XX
        elif cleaned.startswith('3') and len(cleaned) == 10:
            cleaned = '92' + cleaned  # Convert 3XX to 923XX
        
        # Basic validation: should be 10-15 digits
        if not (10 <= len(cleaned) <= 15):
            return False, ""
        
        return True, cleaned
    
    @classmethod
    async def send_message(cls, phone: str, message: str) -> dict:
        """
        Send a single WhatsApp message
        
        Args:
            phone: Recipient phone number (will be validated/normalized)
            message: Message text to send
            
        Returns:
            Dict with success status and message details
            
        TODO: Implement actual WhatsApp Cloud API call
        """
        logger.info(f"📱 [WHATSAPP] Sending message to {phone[:4]}***")
        
        # Validate phone number
        is_valid, normalized = cls.validate_phone_number(phone)
        if not is_valid:
            logger.warning(f"⚠️ [WHATSAPP] Invalid phone number: {phone}")
            return {
                "success": False,
                "error": "Invalid phone number format",
                "phone": phone
            }
        
        # Check if API is configured
        if not cls.is_configured():
            logger.warning("⚠️ [WHATSAPP] API not configured, simulating send")
            # Return simulated success for development
            return {
                "success": True,
                "simulated": True,
                "phone": normalized,
                "message_id": f"sim_{datetime.utcnow().timestamp()}",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # TODO: Implement actual WhatsApp Cloud API call
        # Example implementation:
        # import httpx
        # async with httpx.AsyncClient() as client:
        #     response = await client.post(
        #         f"{cls.API_BASE_URL}/{cls.PHONE_NUMBER_ID}/messages",
        #         headers={
        #             "Authorization": f"Bearer {cls.API_KEY}",
        #             "Content-Type": "application/json"
        #         },
        #         json={
        #             "messaging_product": "whatsapp",
        #             "recipient_type": "individual",
        #             "to": normalized,
        #             "type": "text",
        #             "text": {"body": message}
        #         }
        #     )
        #     return response.json()
        
        # Placeholder return
        return {
            "success": True,
            "simulated": True,
            "phone": normalized,
            "message_id": f"sim_{datetime.utcnow().timestamp()}",
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @classmethod
    async def send_bulk_messages(
        cls,
        phone_list: List[str],
        message: str,
        school_id: str,
        sent_by: str
    ) -> dict:
        """
        Send WhatsApp message to multiple recipients
        
        Args:
            phone_list: List of phone numbers
            message: Message text
            school_id: School ID for logging
            sent_by: Email of user who initiated
            
        Returns:
            Dict with summary of send operation
        """
        logger.info(f"📱 [WHATSAPP] Bulk send to {len(phone_list)} recipients")
        
        results = {
            "total": len(phone_list),
            "success": 0,
            "failed": 0,
            "invalid": 0,
            "details": []
        }
        
        for phone in phone_list:
            # Check for duplicate prevention in last 24 hours
            if await cls._is_duplicate_message(phone, message, school_id):
                logger.info(f"⏭️ [WHATSAPP] Skipping duplicate to {phone[:4]}***")
                results["details"].append({
                    "phone": phone,
                    "status": "skipped",
                    "reason": "duplicate"
                })
                continue
            
            result = await cls.send_message(phone, message)
            
            if result.get("success"):
                results["success"] += 1
            elif result.get("error") == "Invalid phone number format":
                results["invalid"] += 1
            else:
                results["failed"] += 1
            
            results["details"].append({
                "phone": phone,
                **result
            })
        
        return results
    
    @classmethod
    async def schedule_message(
        cls,
        phone_list: List[str],
        message: str,
        schedule_time: datetime,
        school_id: str,
        sent_by: str
    ) -> dict:
        """
        Schedule a WhatsApp message for future delivery
        
        Args:
            phone_list: List of phone numbers
            message: Message text
            schedule_time: When to send the message
            school_id: School ID
            sent_by: User email
            
        Returns:
            Dict with schedule details
            
        TODO: Implement actual scheduling with background job system
        """
        logger.info(f"📅 [WHATSAPP] Scheduling message for {schedule_time.isoformat()} to {len(phone_list)} recipients")
        
        db = get_db()
        
        # Create scheduled message log
        log_doc = {
            "school_id": school_id,
            "message": message,
            "recipient_phones": phone_list,
            "recipients_count": len(phone_list),
            "sent_by": sent_by,
            "status": "scheduled",
            "scheduled_time": schedule_time,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = db.whatsapp_logs.insert_one(log_doc)
        
        # TODO: Add to job queue for scheduled execution
        # Example: celery.send_task('send_scheduled_whatsapp', args=[str(result.inserted_id)], eta=schedule_time)
        
        return {
            "success": True,
            "log_id": str(result.inserted_id),
            "scheduled_for": schedule_time.isoformat(),
            "recipient_count": len(phone_list)
        }
    
    @classmethod
    async def get_connection_status(cls) -> dict:
        """
        Check WhatsApp Business API connection status
        
        Returns:
            Dict with connection status details
            
        TODO: Implement actual API health check
        """
        logger.info("🔍 [WHATSAPP] Checking connection status")
        
        if not cls.is_configured():
            return {
                "connected": False,
                "phone_number": None,
                "business_name": None,
                "last_checked": datetime.utcnow(),
                "error": "WhatsApp API credentials not configured"
            }
        
        # TODO: Make actual API call to check status
        # Example:
        # async with httpx.AsyncClient() as client:
        #     response = await client.get(
        #         f"{cls.API_BASE_URL}/{cls.PHONE_NUMBER_ID}",
        #         headers={"Authorization": f"Bearer {cls.API_KEY}"}
        #     )
        #     data = response.json()
        #     return {
        #         "connected": response.status_code == 200,
        #         "phone_number": data.get("display_phone_number"),
        #         "business_name": data.get("verified_name"),
        #         "last_checked": datetime.utcnow()
        #     }
        
        # Placeholder - assume connected if configured
        return {
            "connected": True,
            "phone_number": f"+{cls.PHONE_NUMBER_ID[-4:]}****",
            "business_name": "School WhatsApp Business",
            "last_checked": datetime.utcnow(),
            "simulated": True
        }
    
    @classmethod
    async def reconnect(cls) -> dict:
        """
        Attempt to reconnect/refresh WhatsApp API connection
        
        Returns:
            Dict with reconnection result
            
        TODO: Implement actual reconnection logic
        """
        logger.info("🔄 [WHATSAPP] Attempting reconnection")
        
        # TODO: Implement token refresh or re-authentication
        status = await cls.get_connection_status()
        
        return {
            "success": status.get("connected", False),
            "status": status
        }
    
    @staticmethod
    async def _is_duplicate_message(phone: str, message: str, school_id: str) -> bool:
        """
        Check if the same message was sent to this phone in the last 24 hours
        
        Args:
            phone: Phone number
            message: Message content
            school_id: School ID
            
        Returns:
            True if duplicate found within 24 hours
        """
        from datetime import timedelta
        
        db = get_db()
        cutoff = datetime.utcnow() - timedelta(hours=24)
        
        existing = db.whatsapp_logs.find_one({
            "school_id": school_id,
            "recipient_phones": phone,
            "message": message,
            "status": {"$in": ["sent", "scheduled"]},
            "created_at": {"$gte": cutoff}
        })
        
        return existing is not None


class WhatsAppTemplateService:
    """Service for managing WhatsApp message templates"""
    
    # Default templates
    DEFAULT_TEMPLATES = [
        {
            "name": "Fee Reminder",
            "type": "fee_reminder",
            "content": "Dear Parent/Guardian,\n\nThis is a reminder that the fee for {student_name} (Class {class_name}) is due.\n\nAmount: Rs. {amount}\nDue Date: {due_date}\n\nPlease ensure timely payment.\n\nThank you,\n{school_name}",
            "variables": ["student_name", "class_name", "amount", "due_date", "school_name"]
        },
        {
            "name": "National Holiday",
            "type": "holiday",
            "content": "Dear Parent/Guardian,\n\nPlease note that {school_name} will remain closed on {date} on account of {holiday_name}.\n\nRegular classes will resume on {resume_date}.\n\nThank you",
            "variables": ["school_name", "date", "holiday_name", "resume_date"]
        },
        {
            "name": "Exam Reminder",
            "type": "exam_reminder",
            "content": "Dear Parent/Guardian,\n\nThis is to inform you that {exam_name} for {student_name} (Class {class_name}) is scheduled to start from {start_date}.\n\nPlease ensure your child is well-prepared.\n\nBest regards,\n{school_name}",
            "variables": ["exam_name", "student_name", "class_name", "start_date", "school_name"]
        },
        {
            "name": "Attendance Alert",
            "type": "attendance_alert",
            "content": "Dear Parent/Guardian,\n\nThis is to inform you that {student_name} (Class {class_name}) was marked {status} on {date}.\n\nPlease contact the school office if you have any concerns.\n\nRegards,\n{school_name}",
            "variables": ["student_name", "class_name", "status", "date", "school_name"]
        },
        {
            "name": "Custom Message",
            "type": "custom",
            "content": "",
            "variables": []
        }
    ]
    
    @classmethod
    def get_templates(cls, school_id: str) -> List[dict]:
        """
        Get all templates for a school (including defaults)
        
        Args:
            school_id: School ID
            
        Returns:
            List of template documents
        """
        db = get_db()
        
        # Get custom templates from database
        custom_templates = list(db.whatsapp_templates.find({
            "school_id": school_id,
            "is_active": True
        }))
        
        for t in custom_templates:
            t["id"] = str(t["_id"])
        
        # Combine with defaults (defaults don't have school_id)
        all_templates = []
        
        # Add defaults first
        for default in cls.DEFAULT_TEMPLATES:
            all_templates.append({
                **default,
                "id": f"default_{default['type']}",
                "is_default": True
            })
        
        # Add custom templates
        all_templates.extend(custom_templates)
        
        return all_templates
    
    @classmethod
    def create_template(cls, template_data: dict, school_id: str) -> dict:
        """
        Create a custom message template
        
        Args:
            template_data: Template details
            school_id: School ID
            
        Returns:
            Created template document
        """
        db = get_db()
        
        doc = {
            "school_id": school_id,
            "name": template_data.get("name"),
            "type": template_data.get("type", "custom"),
            "content": template_data.get("content", ""),
            "variables": template_data.get("variables", []),
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = db.whatsapp_templates.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        
        logger.info(f"📝 [WHATSAPP] Template created: {doc['name']}")
        
        return doc
    
    @classmethod
    def update_template(cls, template_id: str, template_data: dict, school_id: str) -> Optional[dict]:
        """
        Update an existing template
        
        Args:
            template_id: Template ID
            template_data: Updated template details
            school_id: School ID
            
        Returns:
            Updated template or None if not found
        """
        db = get_db()
        
        try:
            result = db.whatsapp_templates.find_one_and_update(
                {"_id": ObjectId(template_id), "school_id": school_id},
                {
                    "$set": {
                        "name": template_data.get("name"),
                        "content": template_data.get("content"),
                        "variables": template_data.get("variables", []),
                        "updated_at": datetime.utcnow()
                    }
                },
                return_document=True
            )
            
            if result:
                result["id"] = str(result["_id"])
                logger.info(f"📝 [WHATSAPP] Template updated: {result['name']}")
            
            return result
        except Exception:
            return None
    
    @classmethod
    def delete_template(cls, template_id: str, school_id: str) -> bool:
        """
        Delete a template (soft delete)
        
        Args:
            template_id: Template ID
            school_id: School ID
            
        Returns:
            True if deleted
        """
        db = get_db()
        
        try:
            result = db.whatsapp_templates.update_one(
                {"_id": ObjectId(template_id), "school_id": school_id},
                {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
            )
            
            return result.modified_count > 0
        except Exception:
            return False


class WhatsAppLogService:
    """Service for managing WhatsApp message logs"""
    
    @classmethod
    def create_log(cls, log_data: dict) -> dict:
        """
        Create a message log entry
        
        Args:
            log_data: Log details
            
        Returns:
            Created log document
        """
        db = get_db()
        
        doc = {
            **log_data,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = db.whatsapp_logs.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        
        return doc
    
    @classmethod
    def update_log_status(cls, log_id: str, status: str, error_message: str = None) -> Optional[dict]:
        """
        Update log status after send attempt
        
        Args:
            log_id: Log ID
            status: New status
            error_message: Error message if failed
            
        Returns:
            Updated log or None
        """
        db = get_db()
        
        update_doc = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        
        if status == "sent":
            update_doc["sent_at"] = datetime.utcnow()
        
        if error_message:
            update_doc["error_message"] = error_message
        
        try:
            result = db.whatsapp_logs.find_one_and_update(
                {"_id": ObjectId(log_id)},
                {"$set": update_doc},
                return_document=True
            )
            
            if result:
                result["id"] = str(result["_id"])
            
            return result
        except Exception:
            return None
    
    @classmethod
    def get_logs(cls, school_id: str, skip: int = 0, limit: int = 50) -> List[dict]:
        """
        Get message logs for a school
        
        Args:
            school_id: School ID
            skip: Pagination offset
            limit: Page size
            
        Returns:
            List of log documents
        """
        db = get_db()
        
        logs = list(db.whatsapp_logs.find(
            {"school_id": school_id}
        ).sort("created_at", -1).skip(skip).limit(limit))
        
        for log in logs:
            log["id"] = str(log["_id"])
        
        return logs
    
    @classmethod
    def get_log_stats(cls, school_id: str) -> dict:
        """
        Get message statistics for a school
        
        Args:
            school_id: School ID
            
        Returns:
            Dict with message statistics
        """
        db = get_db()
        
        pipeline = [
            {"$match": {"school_id": school_id}},
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1},
                    "total_recipients": {"$sum": "$recipients_count"}
                }
            }
        ]
        
        results = list(db.whatsapp_logs.aggregate(pipeline))
        
        stats = {
            "total_messages": 0,
            "total_recipients": 0,
            "sent": 0,
            "pending": 0,
            "scheduled": 0,
            "failed": 0
        }
        
        for r in results:
            status = r["_id"]
            stats["total_messages"] += r["count"]
            stats["total_recipients"] += r.get("total_recipients", 0)
            if status in stats:
                stats[status] = r["count"]
        
        return stats
