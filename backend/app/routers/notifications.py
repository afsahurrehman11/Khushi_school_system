from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
from bson.objectid import ObjectId
import asyncio
import json
from fastapi.responses import StreamingResponse

from app.dependencies.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", response_model=List[dict])
async def list_notifications(current_user: dict = Depends(get_current_user)):
    """Get personal notifications for current user"""
    db = get_db()
    user_email = current_user.get("email", "")
    items = list(db.notifications.find({"user_email": user_email}).sort("created_at", -1).limit(100))
    for it in items:
        it["id"] = str(it["_id"])
    return items


@router.post("", response_model=dict)
async def create_notification(payload: dict, current_user: dict = Depends(get_current_user)):
    """Create a notification for a user (admin or system can call)."""
    db = get_db()
    doc = {
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
    return doc


@router.get("/stream")
async def notification_stream(current_user: dict = Depends(get_current_user)):
    """Server-Sent Events stream for personal notifications (per-user).
    Connect using EventSource with Authorization header.
    """
    user_email = current_user.get("email", "")

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
            pass
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
async def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    result = db.notifications.find_one_and_update({"_id": oid, "user_email": current_user.get("email", "")}, {"$set": {"read": True}}, return_document=True)
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    result["id"] = str(result["_id"])
    return result


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    result = db.notifications.delete_one({"_id": oid, "user_email": current_user.get("email", "")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "deleted"}
