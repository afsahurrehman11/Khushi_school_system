from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from app.dependencies.auth import check_permission
from app.services.fee import get_all_fees
from app.services.payment import get_payments
from app.database import get_db

router = APIRouter()


@router.get("/accounting/summary")
async def accounting_summary(
    start: Optional[str] = Query(None, description="start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="end date YYYY-MM-DD"),
    current_user: dict = Depends(check_permission("accounting.dashboard_view"))
):
    db = get_db()

    # parse dates if provided
    start_dt = None
    end_dt = None
    try:
        if start:
            start_dt = datetime.fromisoformat(start)
        if end:
            end_dt = datetime.fromisoformat(end)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # build fee query
    fee_query = {}
    if start_dt or end_dt:
        # Fees created in range
        fee_query["created_at"] = {}
        if start_dt:
            fee_query["created_at"]["$gte"] = start_dt
        if end_dt:
            fee_query["created_at"]["$lte"] = end_dt

    fees = list(db.fees.find(fee_query))
    total_fees = sum(float(f.get("amount", 0)) for f in fees)
    total_pending = sum(float(f.get("amount", 0)) for f in fees if f.get("status") != "paid")
    total_paid = sum(float(f.get("amount", 0)) for f in fees if f.get("status") == "paid")

    # class-wise summary
    class_summary = {}
    for f in fees:
        cls = f.get("class_id") or "Unassigned"
        cls_entry = class_summary.setdefault(cls, {"total": 0.0, "paid": 0.0, "pending": 0.0})
        amt = float(f.get("amount", 0))
        cls_entry["total"] += amt
        if f.get("status") == "paid":
            cls_entry["paid"] += amt
        else:
            cls_entry["pending"] += amt

    return {
        "total_fees": total_fees,
        "total_paid": total_paid,
        "total_pending": total_pending,
        "class_summary": class_summary,
        "period": {"start": start, "end": end}
    }
