from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List
import csv
import io
from datetime import datetime
from app.dependencies.auth import check_permission
from app.database import get_db

router = APIRouter()


def generate_csv(rows: List[dict], headers: List[str]):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for r in rows:
        writer.writerow([r.get(h, "") for h in headers])
    buffer.seek(0)
    return buffer


@router.get("/reports/fees/csv")
async def export_fees_csv(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    current_user: dict = Depends(check_permission("reports.view"))
):
    db = get_db()
    # parse dates
    start_dt = None
    end_dt = None
    try:
        if start:
            start_dt = datetime.fromisoformat(start)
        if end:
            end_dt = datetime.fromisoformat(end)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")

    query = {}
    if start_dt or end_dt:
        query["created_at"] = {}
        if start_dt:
            query["created_at"]["$gte"] = start_dt
        if end_dt:
            query["created_at"]["$lte"] = end_dt

    fees = list(db.fees.find(query))
    rows = []
    for f in fees:
        rows.append({
            "student_id": f.get("student_id"),
            "class_id": f.get("class_id"),
            "fee_type": f.get("fee_type"),
            "amount": f.get("amount"),
            "status": f.get("status"),
            "due_date": f.get("due_date"),
            "created_at": f.get("created_at").isoformat() if f.get("created_at") else ""
        })

    headers = ["student_id", "class_id", "fee_type", "amount", "status", "due_date", "created_at"]
    csv_buffer = generate_csv(rows, headers)
    filename = f"fees_report_{start or 'all'}_{end or 'all'}.csv"
    return StreamingResponse(csv_buffer, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})
