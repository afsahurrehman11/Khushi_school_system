from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies.auth import check_permission
from app.services.payment_method_service import create_or_get_payment_method, list_payment_methods

router = APIRouter(prefix="/api/payment-methods", tags=["Payment Methods"])


@router.get("", response_model=List[dict])
async def get_payment_methods(current_user: dict = Depends(check_permission("fees.view"))):
    methods = list_payment_methods()
    return methods


@router.post("", response_model=dict)
async def post_payment_method(payload: dict, current_user: dict = Depends(check_permission("fees.manage"))):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Payment method name required")
    method = create_or_get_payment_method(name)
    return method
