"""
Billing Service
Handles billing calculations, invoice generation, and cost management
for the multi-tenant SaaS school management system.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import logging

from app.models.saas import (
    BillingConfig, BillingConfigCreate, BillingPeriod,
    Invoice, InvoiceCreate, InvoiceUpdate, InvoiceStatus,
    InvoiceResponse, CostBreakdown, BulkInvoiceGenerate,
    RevenueAnalytics, StorageAnalytics, BillingAnalytics,
    BillingChangeLog, SchoolStatus
)
from app.services.saas_db import get_saas_root_db, get_database_stats

logger = logging.getLogger(__name__)


# ================= Helper Functions =================

def generate_invoice_number(period_start: datetime) -> str:
    """Generate unique invoice number: INV-YYYY-MM-XXXXX"""
    root_db = get_saas_root_db()
    year_month = period_start.strftime("%Y-%m")
    
    # Count existing invoices for this period
    count = root_db.invoices.count_documents({
        "invoice_number": {"$regex": f"^INV-{year_month}"}
    })
    
    return f"INV-{year_month}-{(count + 1):05d}"


def log_billing_change(
    entity_type: str,
    entity_id: str,
    action: str,
    changes: dict,
    performed_by: str,
    ip_address: Optional[str] = None
):
    """Log billing-related changes for audit trail"""
    root_db = get_saas_root_db()
    
    log_entry = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "changes": changes,
        "performed_by": performed_by,
        "performed_at": datetime.utcnow(),
        "ip_address": ip_address
    }
    
    root_db.billing_change_logs.insert_one(log_entry)
    logger.info(f"[BILLING] Logged {action} on {entity_type} {entity_id}")


# ================= Billing Configuration =================

def get_active_billing_config() -> Optional[BillingConfig]:
    """Get the most recent billing configuration"""
    root_db = get_saas_root_db()
    
    config = root_db.billing_config.find_one(
        {},
        sort=[("created_at", -1)]
    )
    
    if config:
        config["id"] = str(config["_id"])
        return BillingConfig(**config)
    return None


def create_billing_config(
    config_data: BillingConfigCreate,
    created_by: str
) -> BillingConfig:
    """Create new billing configuration"""
    root_db = get_saas_root_db()
    now = datetime.utcnow()
    
    # Validate: fixed + dynamic should roughly equal total
    expected = config_data.fixed_cpu_ram_cost + config_data.dynamic_storage_cost
    if abs(expected - config_data.total_mongo_cost) > 0.01:
        logger.warning(
            f"[BILLING] Cost mismatch: {expected} vs {config_data.total_mongo_cost}"
        )
    
    config_doc = {
        "total_mongo_cost": config_data.total_mongo_cost,
        "billing_period": config_data.billing_period.value,
        "period_start": config_data.period_start,
        "period_end": config_data.period_end,
        "fixed_cpu_ram_cost": config_data.fixed_cpu_ram_cost,
        "dynamic_storage_cost": config_data.dynamic_storage_cost,
        "markup_percentage": config_data.markup_percentage,
        "created_at": now,
        "updated_at": now,
        "created_by": created_by
    }
    
    result = root_db.billing_config.insert_one(config_doc)
    config_doc["id"] = str(result.inserted_id)
    
    # Log the change
    log_billing_change(
        "billing_config",
        str(result.inserted_id),
        "create",
        {"new": config_doc},
        created_by
    )
    
    logger.info(f"[BILLING] Created billing config: ${config_data.total_mongo_cost}")
    return BillingConfig(**config_doc)


def update_billing_config(
    config_id: str,
    updates: dict,
    updated_by: str
) -> Optional[BillingConfig]:
    """Update billing configuration"""
    root_db = get_saas_root_db()
    
    # Get current config for audit log
    current = root_db.billing_config.find_one({"_id": ObjectId(config_id)})
    if not current:
        return None
    
    updates["updated_at"] = datetime.utcnow()
    
    result = root_db.billing_config.update_one(
        {"_id": ObjectId(config_id)},
        {"$set": updates}
    )
    
    if result.modified_count > 0:
        # Log changes
        changes = {k: {"old": current.get(k), "new": v} for k, v in updates.items() if k != "updated_at"}
        log_billing_change("billing_config", config_id, "update", changes, updated_by)
    
    updated = root_db.billing_config.find_one({"_id": ObjectId(config_id)})
    updated["id"] = str(updated["_id"])
    return BillingConfig(**updated)


# ================= Cost Calculation =================

def calculate_school_costs(
    school_storage_bytes: int,
    total_storage_bytes: int,
    billing_config: BillingConfig,
    active_schools_count: int
) -> CostBreakdown:
    """
    Calculate billing breakdown for a single school:
    - Fixed cost: Equal split of CPU/RAM among all schools
    - Storage cost: Proportional to storage usage
    - Markup: Percentage on base costs
    """
    cost = CostBreakdown()
    
    # Fixed cost (equal split)
    if active_schools_count > 0:
        cost.fixed_cost = round(billing_config.fixed_cpu_ram_cost / active_schools_count, 2)
    
    # Storage-based cost (proportional)
    if total_storage_bytes > 0:
        storage_ratio = school_storage_bytes / total_storage_bytes
        cost.storage_cost = round(billing_config.dynamic_storage_cost * storage_ratio, 2)
    
    # Base total
    cost.base_total = round(cost.fixed_cost + cost.storage_cost, 2)
    
    # Apply markup
    cost.markup_amount = round(cost.base_total * (billing_config.markup_percentage / 100), 2)
    cost.subtotal = round(cost.base_total + cost.markup_amount, 2)
    
    # Initial total (before manual adjustments)
    cost.total = cost.subtotal
    
    return cost


def recalculate_invoice_total(cost: CostBreakdown) -> float:
    """Recalculate total after manual adjustments"""
    total = cost.subtotal
    total += cost.misc_charges
    total += cost.crash_recovery_charges
    total += cost.urgent_recovery_charges
    total -= cost.discount
    return round(max(0, total), 2)


# ================= Invoice Operations =================

def create_invoice(
    invoice_data: InvoiceCreate,
    created_by: str
) -> Invoice:
    """Create invoice for a single school"""
    root_db = get_saas_root_db()
    
    # Get school data
    school = root_db.schools.find_one({"school_id": invoice_data.school_id})
    if not school:
        raise ValueError(f"School not found: {invoice_data.school_id}")
    
    if school.get("status") != SchoolStatus.ACTIVE.value:
        raise ValueError(f"Cannot create invoice for non-active school")
    
    # Get billing config
    config = get_active_billing_config()
    if not config:
        raise ValueError("No billing configuration found. Please set up billing first.")
    
    # Get current storage stats
    school_storage = school.get("storage_bytes", 0)
    
    # Calculate total storage across all active schools
    total_storage = 0
    active_count = 0
    for s in root_db.schools.find({"status": SchoolStatus.ACTIVE.value}):
        total_storage += s.get("storage_bytes", 0)
        active_count += 1
    
    storage_percentage = (school_storage / total_storage * 100) if total_storage > 0 else 0
    
    # Calculate costs
    cost_breakdown = calculate_school_costs(
        school_storage, total_storage, config, active_count
    )
    
    now = datetime.utcnow()
    invoice_number = generate_invoice_number(invoice_data.period_start)
    
    invoice_doc = {
        "invoice_number": invoice_number,
        "school_id": invoice_data.school_id,
        "school_name": school["school_name"],
        "database_name": school["database_name"],
        "billing_period": invoice_data.billing_period.value,
        "period_start": invoice_data.period_start,
        "period_end": invoice_data.period_end,
        "storage_bytes": school_storage,
        "storage_percentage": round(storage_percentage, 2),
        "student_count": school.get("student_count", 0),
        "teacher_count": school.get("teacher_count", 0),
        "cost_breakdown": cost_breakdown.dict(),
        "status": InvoiceStatus.DRAFT.value,
        "notes": invoice_data.notes,
        "internal_notes": None,
        "created_at": now,
        "updated_at": now,
        "issued_at": None,
        "paid_at": None,
        "due_date": invoice_data.due_date,
        "created_by": created_by,
        "last_modified_by": None
    }
    
    result = root_db.invoices.insert_one(invoice_doc)
    invoice_doc["id"] = str(result.inserted_id)
    
    # Log creation
    log_billing_change(
        "invoice", str(result.inserted_id), "create",
        {"invoice_number": invoice_number, "school_id": invoice_data.school_id},
        created_by
    )
    
    logger.info(f"[BILLING] Created invoice {invoice_number} for {school['school_name']}")
    return Invoice(**invoice_doc)


def generate_bulk_invoices(
    bulk_data: BulkInvoiceGenerate,
    created_by: str
) -> List[Invoice]:
    """Generate invoices for all active schools"""
    root_db = get_saas_root_db()
    invoices = []
    
    # Get all active schools
    schools = list(root_db.schools.find({"status": SchoolStatus.ACTIVE.value}))
    
    if not schools:
        raise ValueError("No active schools found")
    
    logger.info(f"[BILLING] Generating bulk invoices for {len(schools)} schools")
    
    for school in schools:
        try:
            # Check if invoice already exists for this period and school
            existing = root_db.invoices.find_one({
                "school_id": school["school_id"],
                "period_start": bulk_data.period_start,
                "period_end": bulk_data.period_end
            })
            
            if existing:
                logger.warning(
                    f"[BILLING] Invoice already exists for {school['school_name']} "
                    f"for period {bulk_data.period_start} to {bulk_data.period_end}"
                )
                continue
            
            invoice_data = InvoiceCreate(
                school_id=school["school_id"],
                billing_period=bulk_data.billing_period,
                period_start=bulk_data.period_start,
                period_end=bulk_data.period_end,
                due_date=bulk_data.due_date
            )
            
            invoice = create_invoice(invoice_data, created_by)
            invoices.append(invoice)
            
        except Exception as e:
            logger.error(f"[BILLING] Error creating invoice for {school['school_name']}: {e}")
            continue
    
    logger.info(f"[BILLING] Generated {len(invoices)} invoices")
    return invoices


def get_invoice(invoice_id: str) -> Optional[Invoice]:
    """Get single invoice by ID"""
    root_db = get_saas_root_db()
    
    invoice = root_db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if invoice:
        invoice["id"] = str(invoice["_id"])
        # Ensure cost_breakdown is properly formatted
        if "cost_breakdown" in invoice and isinstance(invoice["cost_breakdown"], dict):
            invoice["cost_breakdown"] = CostBreakdown(**invoice["cost_breakdown"])
        return Invoice(**invoice)
    return None


def get_invoices_by_school(school_id: str) -> List[Invoice]:
    """Get all invoices for a school"""
    root_db = get_saas_root_db()
    
    invoices = []
    for inv in root_db.invoices.find({"school_id": school_id}).sort("created_at", -1):
        inv["id"] = str(inv["_id"])
        if "cost_breakdown" in inv and isinstance(inv["cost_breakdown"], dict):
            inv["cost_breakdown"] = CostBreakdown(**inv["cost_breakdown"])
        invoices.append(Invoice(**inv))
    
    return invoices


def get_all_invoices(
    status: Optional[InvoiceStatus] = None,
    billing_period: Optional[BillingPeriod] = None,
    skip: int = 0,
    limit: int = 100
) -> List[Invoice]:
    """Get all invoices with optional filters"""
    root_db = get_saas_root_db()
    
    query = {}
    if status:
        query["status"] = status.value
    if billing_period:
        query["billing_period"] = billing_period.value
    
    invoices = []
    cursor = root_db.invoices.find(query).sort("created_at", -1).skip(skip).limit(limit)
    
    for inv in cursor:
        inv["id"] = str(inv["_id"])
        if "cost_breakdown" in inv and isinstance(inv["cost_breakdown"], dict):
            inv["cost_breakdown"] = CostBreakdown(**inv["cost_breakdown"])
        invoices.append(Invoice(**inv))
    
    return invoices


def update_invoice(
    invoice_id: str,
    updates: InvoiceUpdate,
    updated_by: str
) -> Optional[Invoice]:
    """Update invoice with manual adjustments"""
    root_db = get_saas_root_db()
    
    # Get current invoice
    current = root_db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not current:
        return None
    
    # Build update document
    update_doc = {"updated_at": datetime.utcnow(), "last_modified_by": updated_by}
    changes = {}
    
    # Handle cost breakdown updates
    cost_breakdown = current.get("cost_breakdown", {})
    
    if updates.misc_charges is not None:
        changes["misc_charges"] = {"old": cost_breakdown.get("misc_charges", 0), "new": updates.misc_charges}
        cost_breakdown["misc_charges"] = updates.misc_charges
    
    if updates.misc_charges_description is not None:
        cost_breakdown["misc_charges_description"] = updates.misc_charges_description
    
    if updates.crash_recovery_charges is not None:
        changes["crash_recovery_charges"] = {
            "old": cost_breakdown.get("crash_recovery_charges", 0),
            "new": updates.crash_recovery_charges
        }
        cost_breakdown["crash_recovery_charges"] = updates.crash_recovery_charges
    
    if updates.urgent_recovery_charges is not None:
        changes["urgent_recovery_charges"] = {
            "old": cost_breakdown.get("urgent_recovery_charges", 0),
            "new": updates.urgent_recovery_charges
        }
        cost_breakdown["urgent_recovery_charges"] = updates.urgent_recovery_charges
    
    if updates.discount is not None:
        changes["discount"] = {"old": cost_breakdown.get("discount", 0), "new": updates.discount}
        cost_breakdown["discount"] = updates.discount
    
    if updates.discount_description is not None:
        cost_breakdown["discount_description"] = updates.discount_description
    
    # Recalculate total
    cost = CostBreakdown(**cost_breakdown)
    cost_breakdown["total"] = recalculate_invoice_total(cost)
    update_doc["cost_breakdown"] = cost_breakdown
    
    # Handle status updates
    if updates.status is not None:
        changes["status"] = {"old": current.get("status"), "new": updates.status.value}
        update_doc["status"] = updates.status.value
        
        if updates.status == InvoiceStatus.PENDING:
            update_doc["issued_at"] = datetime.utcnow()
        elif updates.status == InvoiceStatus.PAID:
            update_doc["paid_at"] = datetime.utcnow()
    
    # Handle other field updates
    if updates.notes is not None:
        update_doc["notes"] = updates.notes
    if updates.internal_notes is not None:
        update_doc["internal_notes"] = updates.internal_notes
    if updates.due_date is not None:
        update_doc["due_date"] = updates.due_date
    
    # Perform update
    root_db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": update_doc}
    )
    
    # Log changes
    if changes:
        log_billing_change("invoice", invoice_id, "update", changes, updated_by)
    
    return get_invoice(invoice_id)


def delete_invoice(invoice_id: str, deleted_by: str) -> bool:
    """Delete a draft invoice"""
    root_db = get_saas_root_db()
    
    invoice = root_db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        return False
    
    if invoice.get("status") != InvoiceStatus.DRAFT.value:
        raise ValueError("Only draft invoices can be deleted")
    
    result = root_db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    
    if result.deleted_count > 0:
        log_billing_change(
            "invoice", invoice_id, "delete",
            {"invoice_number": invoice.get("invoice_number")},
            deleted_by
        )
        logger.info(f"[BILLING] Deleted invoice {invoice.get('invoice_number')}")
        return True
    
    return False


# ================= Analytics =================

def get_revenue_analytics() -> RevenueAnalytics:
    """Calculate revenue analytics for root dashboard"""
    root_db = get_saas_root_db()
    analytics = RevenueAnalytics()
    
    # Get active billing config
    config = get_active_billing_config()
    if config:
        analytics.total_mongo_cost = config.total_mongo_cost
    
    # Calculate total predicted revenue from all non-cancelled invoices
    pipeline = [
        {"$match": {"status": {"$nin": [InvoiceStatus.CANCELLED.value]}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$cost_breakdown.total"}
        }}
    ]
    
    result = list(root_db.invoices.aggregate(pipeline))
    if result:
        analytics.total_predicted_revenue = round(result[0].get("total", 0), 2)
    
    # Calculate profit
    analytics.total_profit = round(
        analytics.total_predicted_revenue - analytics.total_mongo_cost, 2
    )
    
    # Profit margin
    if analytics.total_predicted_revenue > 0:
        analytics.profit_margin_percentage = round(
            (analytics.total_profit / analytics.total_predicted_revenue) * 100, 2
        )
    
    # Revenue by plan
    plan_pipeline = [
        {"$match": {"status": {"$nin": [InvoiceStatus.CANCELLED.value]}}},
        {"$lookup": {
            "from": "schools",
            "localField": "school_id",
            "foreignField": "school_id",
            "as": "school"
        }},
        {"$unwind": "$school"},
        {"$group": {
            "_id": "$school.plan",
            "revenue": {"$sum": "$cost_breakdown.total"}
        }}
    ]
    
    plan_results = list(root_db.invoices.aggregate(plan_pipeline))
    analytics.revenue_by_plan = {r["_id"]: round(r["revenue"], 2) for r in plan_results}
    
    return analytics


def get_storage_analytics(top_n: int = 5) -> StorageAnalytics:
    """Calculate storage distribution analytics"""
    root_db = get_saas_root_db()
    analytics = StorageAnalytics()
    
    # Get all active schools with storage data
    schools = list(root_db.schools.find(
        {"status": SchoolStatus.ACTIVE.value},
        {"school_id": 1, "school_name": 1, "storage_bytes": 1}
    ).sort("storage_bytes", -1))
    
    if not schools:
        return analytics
    
    # Calculate totals
    total_storage = sum(s.get("storage_bytes", 0) for s in schools)
    analytics.total_storage_bytes = total_storage
    analytics.average_storage_per_school = round(total_storage / len(schools), 2) if schools else 0
    
    # Top schools
    for school in schools[:top_n]:
        storage = school.get("storage_bytes", 0)
        percentage = (storage / total_storage * 100) if total_storage > 0 else 0
        analytics.top_schools.append({
            "school_id": school.get("school_id"),
            "school_name": school.get("school_name"),
            "storage_bytes": storage,
            "percentage": round(percentage, 2)
        })
    
    # Distribution for pie chart (all schools)
    for school in schools:
        analytics.storage_distribution.append({
            "school_name": school.get("school_name"),
            "storage_bytes": school.get("storage_bytes", 0)
        })
    
    return analytics


def get_billing_analytics() -> BillingAnalytics:
    """Get comprehensive billing analytics"""
    root_db = get_saas_root_db()
    
    analytics = BillingAnalytics(
        revenue=get_revenue_analytics(),
        storage=get_storage_analytics()
    )
    
    # Invoice counts by status
    status_counts = root_db.invoices.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ])
    
    for item in status_counts:
        status = item["_id"]
        count = item["count"]
        analytics.total_invoices += count
        
        if status == InvoiceStatus.DRAFT.value:
            analytics.draft_invoices = count
        elif status == InvoiceStatus.PENDING.value:
            analytics.pending_invoices = count
        elif status == InvoiceStatus.PAID.value:
            analytics.paid_invoices = count
        elif status == InvoiceStatus.OVERDUE.value:
            analytics.overdue_invoices = count
    
    # Schools exceeding storage threshold (e.g., > 1GB)
    storage_threshold = 1 * 1024 * 1024 * 1024  # 1GB
    high_storage_schools = root_db.schools.find({
        "status": SchoolStatus.ACTIVE.value,
        "storage_bytes": {"$gt": storage_threshold}
    })
    
    for school in high_storage_schools:
        analytics.schools_exceeding_storage.append({
            "school_id": school.get("school_id"),
            "school_name": school.get("school_name"),
            "storage_bytes": school.get("storage_bytes", 0)
        })
    
    return analytics


def get_school_billing_history(
    school_id: str,
    months: int = 12
) -> List[dict]:
    """Get billing history for a school over time"""
    root_db = get_saas_root_db()
    
    # Get invoices for this school
    invoices = list(root_db.invoices.find(
        {"school_id": school_id},
        {"period_start": 1, "cost_breakdown.total": 1, "storage_bytes": 1}
    ).sort("period_start", -1).limit(months))
    
    history = []
    for inv in invoices:
        history.append({
            "period": inv.get("period_start").strftime("%Y-%m") if inv.get("period_start") else "",
            "total": inv.get("cost_breakdown", {}).get("total", 0),
            "storage_bytes": inv.get("storage_bytes", 0)
        })
    
    return list(reversed(history))


def get_billing_change_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 50
) -> List[BillingChangeLog]:
    """Get billing change logs for audit"""
    root_db = get_saas_root_db()
    
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    
    logs = []
    for log in root_db.billing_change_logs.find(query).sort("performed_at", -1).limit(limit):
        log["id"] = str(log["_id"])
        logs.append(BillingChangeLog(**log))
    
    return logs
