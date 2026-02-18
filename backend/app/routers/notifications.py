from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
from bson.objectid import ObjectId
import asyncio
import json
import logging
from fastapi.responses import StreamingResponse

from app.dependencies.auth import check_permission, get_current_user
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", response_model=List[dict])
async def list_notifications(current_user: dict = Depends(check_permission("notification.view"))):
    """Get personal notifications for current user"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Listing notifications")
    
    try:
        db = get_db()
        user_email = current_user.get("email", "")
        query = {
            "user_email": user_email,
            "school_id": school_id
        }
        items = list(db.notifications.find(query).sort("created_at", -1).limit(100))
        for it in items:
            it["id"] = str(it["_id"])
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Retrieved {len(items)} notifications")
        return items
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to list notifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list notifications: {str(e)}")


@router.post("", response_model=dict)
async def create_notification(payload: dict, current_user: dict = Depends(check_permission("notification.manage"))):
    """Create a notification for a user (admin or system can call)."""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating notification: type={payload.get('type', 'info')}")
    
    try:
        db = get_db()
        doc = {
            "school_id": school_id,
            "user_email": payload.get("user_email") or current_user.get("email", ""),
            "type": payload.get("type", "info"),
            "channel": payload.get("channel", "in-app"),
            "title": payload.get("title", ""),
            "message": payload.get("message", ""),
            "data": payload.get("data", {}),
            "read": False,
            "created_at": datetime.utcnow(),
        }
        res = db.notifications.insert_one(doc)
        doc["id"] = str(res.inserted_id)
        
        # Optionally publish to SSE listeners in student_import_export if needed
        try:
            from app.routers.student_import_export import _publish_notification
            _publish_notification(doc["user_email"], {"type": "notification", "payload": {"id": doc["id"], "title": doc["title"], "message": doc["message"], "created_at": doc["created_at"].isoformat()}})
        except Exception:
            pass
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Notification created successfully")
        return doc
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create notification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create notification: {str(e)}")


@router.get("/stream")
async def notification_stream(current_user: dict = Depends(get_current_user)):
    """Server-Sent Events stream for personal notifications (per-user).
    Connect using EventSource with Authorization header.
    """
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    user_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Opening notification stream")

    try:
        from app.routers.student_import_export import _notification_queues
    except Exception:
        _notification_queues = {}

    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    if user_email not in _notification_queues:
        _notification_queues[user_email] = []
    _notification_queues[user_email].append(queue)

    async def event_generator():
        try:
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(payload, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            logger.info(f"[SCHOOL:{school_id}] Notification stream closed")
        finally:
            _notification_queues.get(user_email, []).remove(queue) if queue in _notification_queues.get(user_email, []) else None

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.put("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: dict = Depends(check_permission("notification.manage"))):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Marking notification {notification_id} as read")
    
    try:
        db = get_db()
        try:
            oid = ObjectId(notification_id)
        except Exception:
            logger.error(f"[SCHOOL:{school_id}] ❌ Invalid notification id: {notification_id}")
            raise HTTPException(status_code=400, detail="Invalid id")
        
        result = db.notifications.find_one_and_update(
            {"_id": oid, "user_email": current_user.get("email", ""), "school_id": school_id}, 
            {"$set": {"read": True}}, 
            return_document=True
        )
        if not result:
            logger.error(f"[SCHOOL:{school_id}] ❌ Notification not found: {notification_id}")
            raise HTTPException(status_code=404, detail="Notification not found")
        
        result["id"] = str(result["_id"])
        logger.info(f"[SCHOOL:{school_id}] ✅ Notification marked as read")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to mark notification as read: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark notification as read: {str(e)}")


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(check_permission("notification.manage"))):
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email", "")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting notification {notification_id}")
    
    try:
        db = get_db()
        try:
            oid = ObjectId(notification_id)
        except Exception:
            logger.error(f"[SCHOOL:{school_id}] ❌ Invalid notification id: {notification_id}")
            raise HTTPException(status_code=400, detail="Invalid id")
        
        result = db.notifications.delete_one({"_id": oid, "user_email": current_user.get("email", ""), "school_id": school_id})
        if result.deleted_count == 0:
            logger.error(f"[SCHOOL:{school_id}] ❌ Notification not found: {notification_id}")
            raise HTTPException(status_code=404, detail="Notification not found")
        
        logger.info(f"[SCHOOL:{school_id}] ✅ Notification deleted successfully")
        return {"message": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete notification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete notification: {str(e)}")
