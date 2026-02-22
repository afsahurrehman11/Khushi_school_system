"""
Billing API Router
Handles billing configuration, invoice management, and analytics endpoints.
Root user only access for most operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime
from io import BytesIO
import logging

from app.dependencies.auth import get_current_root, get_current_user
from app.models.saas import (
    BillingConfig, BillingConfigCreate, BillingPeriod,
    Invoice, InvoiceCreate, InvoiceUpdate, InvoiceStatus,
    InvoiceResponse, BulkInvoiceGenerate, BillingAnalytics,
    RevenueAnalytics, StorageAnalytics, BillingChangeLog
)
from app.services.billing_service import (
    get_active_billing_config, create_billing_config, update_billing_config,
    create_invoice, generate_bulk_invoices, get_invoice, get_invoices_by_school,
    get_all_invoices, update_invoice, delete_invoice,
    get_revenue_analytics, get_storage_analytics, get_billing_analytics,
    get_school_billing_history, get_billing_change_logs
)
from app.services.pdf_service import (
    generate_invoice_pdf, generate_billing_report_pdf
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


# ================= Billing Configuration =================

@router.get("/config", response_model=Optional[BillingConfig])
async def get_billing_config_endpoint(
    current_user: dict = Depends(get_current_root)
):
    """Get current billing configuration (root only)"""
    config = get_active_billing_config()
    return config


@router.post("/config", response_model=BillingConfig)
async def create_billing_config_endpoint(
    config_data: BillingConfigCreate,
    current_user: dict = Depends(get_current_root)
):
    """Create new billing configuration (root only)"""
    try:
        config = create_billing_config(
            config_data,
            created_by=current_user.get("email", "root")
        )
        return config
    except Exception as e:
        logger.error(f"[BILLING API] Error creating config: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/config/{config_id}", response_model=BillingConfig)
async def update_billing_config_endpoint(
    config_id: str,
    updates: dict,
    current_user: dict = Depends(get_current_root)
):
    """Update billing configuration (root only)"""
    try:
        config = update_billing_config(
            config_id,
            updates,
            updated_by=current_user.get("email", "root")
        )
        if not config:
            raise HTTPException(status_code=404, detail="Configuration not found")
        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BILLING API] Error updating config: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ================= Invoice Management =================

@router.get("/invoices", response_model=List[InvoiceResponse])
async def get_invoices_endpoint(
    status: Optional[InvoiceStatus] = None,
    billing_period: Optional[BillingPeriod] = None,
    school_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_root)
):
    """Get all invoices with optional filters (root only)"""
    try:
        if school_id:
            invoices = get_invoices_by_school(school_id)
        else:
            invoices = get_all_invoices(
                status=status,
                billing_period=billing_period,
                skip=skip,
                limit=limit
            )
        
        # Convert to response model
        response = []
        for inv in invoices:
            inv_dict = inv.dict() if hasattr(inv, 'dict') else inv
            inv_dict["total_amount"] = inv_dict.get("cost_breakdown", {}).get("total", 0)
            response.append(InvoiceResponse(**inv_dict))
        
        return response
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice_endpoint(
    invoice_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Get single invoice by ID (root only)"""
    invoice = get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    inv_dict = invoice.dict()
    inv_dict["total_amount"] = inv_dict.get("cost_breakdown", {}).get("total", 0)
    return InvoiceResponse(**inv_dict)


@router.post("/invoices", response_model=InvoiceResponse)
async def create_invoice_endpoint(
    invoice_data: InvoiceCreate,
    current_user: dict = Depends(get_current_root)
):
    """Create invoice for a single school (root only)"""
    try:
        invoice = create_invoice(
            invoice_data,
            created_by=current_user.get("email", "root")
        )
        inv_dict = invoice.dict()
        inv_dict["total_amount"] = inv_dict.get("cost_breakdown", {}).get("total", 0)
        return InvoiceResponse(**inv_dict)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[BILLING API] Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invoices/bulk", response_model=List[InvoiceResponse])
async def generate_bulk_invoices_endpoint(
    bulk_data: BulkInvoiceGenerate,
    current_user: dict = Depends(get_current_root)
):
    """Generate invoices for all active schools (root only)"""
    try:
        invoices = generate_bulk_invoices(
            bulk_data,
            created_by=current_user.get("email", "root")
        )
        
        response = []
        for inv in invoices:
            inv_dict = inv.dict()
            inv_dict["total_amount"] = inv_dict.get("cost_breakdown", {}).get("total", 0)
            response.append(InvoiceResponse(**inv_dict))
        
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[BILLING API] Error generating bulk invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice_endpoint(
    invoice_id: str,
    updates: InvoiceUpdate,
    current_user: dict = Depends(get_current_root)
):
    """Update invoice (root only) - for manual adjustments"""
    try:
        invoice = update_invoice(
            invoice_id,
            updates,
            updated_by=current_user.get("email", "root")
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        inv_dict = invoice.dict()
        inv_dict["total_amount"] = inv_dict.get("cost_breakdown", {}).get("total", 0)
        return InvoiceResponse(**inv_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BILLING API] Error updating invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/invoices/{invoice_id}")
async def delete_invoice_endpoint(
    invoice_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Delete a draft invoice (root only)"""
    try:
        success = delete_invoice(
            invoice_id,
            deleted_by=current_user.get("email", "root")
        )
        if not success:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"message": "Invoice deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BILLING API] Error deleting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= PDF Generation =================

@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf_endpoint(
    invoice_id: str,
    current_user: dict = Depends(get_current_root)
):
    """Download invoice as PDF (root only)"""
    invoice = get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    try:
        pdf_bytes = generate_invoice_pdf(invoice)
        
        filename = f"Invoice_{invoice.invoice_number.replace('-', '_')}.pdf"
        
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(pdf_bytes))
            }
        )
    except ImportError as e:
        raise HTTPException(
            status_code=501,
            detail="PDF generation requires reportlab. Install with: pip install reportlab"
        )
    except Exception as e:
        logger.error(f"[BILLING API] Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@router.get("/reports/pdf")
async def download_billing_report_pdf_endpoint(
    current_user: dict = Depends(get_current_root)
):
    """Download billing analytics report as PDF (root only)"""
    try:
        analytics = get_billing_analytics()
        pdf_bytes = generate_billing_report_pdf(analytics.dict())
        
        filename = f"Billing_Report_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(pdf_bytes))
            }
        )
    except ImportError as e:
        raise HTTPException(
            status_code=501,
            detail="PDF generation requires reportlab"
        )
    except Exception as e:
        logger.error(f"[BILLING API] Error generating report PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Analytics =================

@router.get("/analytics", response_model=BillingAnalytics)
async def get_billing_analytics_endpoint(
    current_user: dict = Depends(get_current_root)
):
    """Get comprehensive billing analytics (root only)"""
    try:
        return get_billing_analytics()
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/revenue", response_model=RevenueAnalytics)
async def get_revenue_analytics_endpoint(
    current_user: dict = Depends(get_current_root)
):
    """Get revenue analytics (root only)"""
    try:
        return get_revenue_analytics()
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching revenue analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/storage", response_model=StorageAnalytics)
async def get_storage_analytics_endpoint(
    top_n: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(get_current_root)
):
    """Get storage distribution analytics (root only)"""
    try:
        return get_storage_analytics(top_n=top_n)
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching storage analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/school/{school_id}/history")
async def get_school_billing_history_endpoint(
    school_id: str,
    months: int = Query(12, ge=1, le=36),
    current_user: dict = Depends(get_current_root)
):
    """Get billing history for a school (root only)"""
    try:
        history = get_school_billing_history(school_id, months=months)
        return {"school_id": school_id, "history": history}
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching school history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Audit Logs =================

@router.get("/logs", response_model=List[BillingChangeLog])
async def get_billing_logs_endpoint(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_root)
):
    """Get billing change logs for audit (root only)"""
    try:
        return get_billing_change_logs(
            entity_type=entity_type,
            entity_id=entity_id,
            limit=limit
        )
    except Exception as e:
        logger.error(f"[BILLING API] Error fetching logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================= Export =================

@router.get("/export/invoices")
async def export_invoices_csv_endpoint(
    status: Optional[InvoiceStatus] = None,
    current_user: dict = Depends(get_current_root)
):
    """Export invoices as CSV (root only)"""
    try:
        invoices = get_all_invoices(status=status, limit=10000)
        
        # Build CSV content
        csv_lines = [
            "Invoice Number,School Name,Period Start,Period End,Status,"
            "Storage (Bytes),Fixed Cost,Storage Cost,Markup,Misc Charges,"
            "Crash Recovery,Urgent Recovery,Discount,Total,Created At"
        ]
        
        for inv in invoices:
            inv_dict = inv.dict() if hasattr(inv, 'dict') else inv
            cost = inv_dict.get("cost_breakdown", {})
            
            line = ",".join([
                inv_dict.get("invoice_number", ""),
                f'"{inv_dict.get("school_name", "")}"',
                str(inv_dict.get("period_start", "")),
                str(inv_dict.get("period_end", "")),
                inv_dict.get("status", ""),
                str(inv_dict.get("storage_bytes", 0)),
                str(cost.get("fixed_cost", 0)),
                str(cost.get("storage_cost", 0)),
                str(cost.get("markup_amount", 0)),
                str(cost.get("misc_charges", 0)),
                str(cost.get("crash_recovery_charges", 0)),
                str(cost.get("urgent_recovery_charges", 0)),
                str(cost.get("discount", 0)),
                str(cost.get("total", 0)),
                str(inv_dict.get("created_at", ""))
            ])
            csv_lines.append(line)
        
        content = "\n".join(csv_lines)
        
        filename = f"invoices_export_{datetime.utcnow().strftime('%Y%m%d')}.csv"
        
        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        logger.error(f"[BILLING API] Error exporting invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/analytics")
async def export_analytics_json_endpoint(
    current_user: dict = Depends(get_current_root)
):
    """Export billing analytics as JSON (root only)"""
    try:
        analytics = get_billing_analytics()
        return analytics.dict()
    except Exception as e:
        logger.error(f"[BILLING API] Error exporting analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
