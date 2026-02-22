"""
PDF Invoice Generation Service
Generates well-formatted PDF invoices with billing breakdown and charts.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from io import BytesIO
import logging
import base64

try:
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.units import inch, mm
    from reportlab.lib.colors import HexColor, black, white, gray
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        Image as RLImage, PageBreak, HRFlowable
    )
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.charts.linecharts import HorizontalLineChart
    from reportlab.graphics.widgets.markers import makeMarker
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from matplotlib.figure import Figure
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False

from app.models.saas import Invoice, CostBreakdown
from app.services.saas_db import get_saas_root_db

logger = logging.getLogger(__name__)

# ================= Color Scheme =================
COLORS = {
    'primary': HexColor('#0284c7') if REPORTLAB_AVAILABLE else '#0284c7',
    'secondary': HexColor('#64748b') if REPORTLAB_AVAILABLE else '#64748b',
    'success': HexColor('#16a34a') if REPORTLAB_AVAILABLE else '#16a34a',
    'warning': HexColor('#d97706') if REPORTLAB_AVAILABLE else '#d97706',
    'danger': HexColor('#dc2626') if REPORTLAB_AVAILABLE else '#dc2626',
    'light_bg': HexColor('#f8fafc') if REPORTLAB_AVAILABLE else '#f8fafc',
    'border': HexColor('#e2e8f0') if REPORTLAB_AVAILABLE else '#e2e8f0',
    'text': HexColor('#1e293b') if REPORTLAB_AVAILABLE else '#1e293b',
    'text_muted': HexColor('#64748b') if REPORTLAB_AVAILABLE else '#64748b',
}


def format_bytes(size_bytes: int) -> str:
    """Format bytes to human readable string"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def format_currency(amount: float) -> str:
    """Format amount as currency"""
    return f"${amount:,.2f}"


def get_storage_history_for_school(school_id: str, months: int = 6) -> List[dict]:
    """Get storage history from usage snapshots"""
    root_db = get_saas_root_db()
    
    snapshots = list(root_db.usage_snapshots.find(
        {"school_id": school_id},
        {"date": 1, "storage_bytes": 1}
    ).sort("date", -1).limit(months))
    
    history = []
    for snap in reversed(snapshots):
        history.append({
            "date": snap.get("date"),
            "storage_bytes": snap.get("storage_bytes", 0)
        })
    
    return history


def create_storage_chart_matplotlib(history: List[dict], school_name: str) -> Optional[bytes]:
    """Create storage growth chart using matplotlib"""
    if not MATPLOTLIB_AVAILABLE or not history:
        return None
    
    try:
        fig, ax = plt.subplots(figsize=(6, 3), dpi=100)
        
        dates = [h["date"] for h in history if h.get("date")]
        values = [h["storage_bytes"] / (1024 * 1024) for h in history]  # Convert to MB
        
        if not dates or len(dates) < 2:
            # Create dummy data if not enough history
            dates = [datetime.utcnow()]
            values = [history[0]["storage_bytes"] / (1024 * 1024)] if history else [0]
        
        ax.fill_between(range(len(values)), values, alpha=0.3, color='#0284c7')
        ax.plot(range(len(values)), values, marker='o', color='#0284c7', linewidth=2)
        
        ax.set_xlabel('Period', fontsize=9, color='#64748b')
        ax.set_ylabel('Storage (MB)', fontsize=9, color='#64748b')
        ax.set_title(f'Storage Growth - {school_name}', fontsize=11, fontweight='bold', color='#1e293b')
        
        # Style the axes
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#e2e8f0')
        ax.spines['bottom'].set_color('#e2e8f0')
        ax.tick_params(colors='#64748b')
        ax.grid(axis='y', alpha=0.3, color='#e2e8f0')
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', facecolor='white')
        plt.close(fig)
        buffer.seek(0)
        
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"[PDF] Error creating chart: {e}")
        return None


def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """Generate PDF invoice with billing breakdown and charts"""
    if not REPORTLAB_AVAILABLE:
        raise ImportError("reportlab is required for PDF generation. Install with: pip install reportlab")
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=COLORS['primary'],
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=COLORS['text'],
        spaceBefore=15,
        spaceAfter=8
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=COLORS['text'],
        spaceAfter=4
    )
    
    small_style = ParagraphStyle(
        'Small',
        parent=styles['Normal'],
        fontSize=9,
        textColor=COLORS['text_muted']
    )
    
    # Build document elements
    elements = []
    
    # Header
    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Spacer(1, 5*mm))
    
    # Invoice info table
    invoice_info = [
        ["Invoice Number:", invoice.invoice_number],
        ["Issue Date:", datetime.utcnow().strftime("%B %d, %Y")],
        ["Due Date:", invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "N/A"],
        ["Status:", invoice.status.value.upper()],
    ]
    
    info_table = Table(invoice_info, colWidths=[100, 150])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), COLORS['text']),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 10*mm))
    
    # Separator
    elements.append(HRFlowable(width="100%", thickness=1, color=COLORS['border']))
    elements.append(Spacer(1, 5*mm))
    
    # Bill To section
    elements.append(Paragraph("BILL TO", heading_style))
    elements.append(Paragraph(f"<b>{invoice.school_name}</b>", normal_style))
    elements.append(Paragraph(f"Database: {invoice.database_name}", small_style))
    elements.append(Spacer(1, 5*mm))
    
    # Billing Period
    elements.append(Paragraph("BILLING PERIOD", heading_style))
    period_text = f"{invoice.period_start.strftime('%B %d, %Y')} - {invoice.period_end.strftime('%B %d, %Y')}"
    elements.append(Paragraph(period_text, normal_style))
    elements.append(Spacer(1, 5*mm))
    
    # Usage Statistics
    elements.append(Paragraph("USAGE STATISTICS", heading_style))
    usage_data = [
        ["Metric", "Value"],
        ["Storage Used", format_bytes(invoice.storage_bytes)],
        ["Storage Share", f"{invoice.storage_percentage:.2f}%"],
        ["Students", str(invoice.student_count)],
        ["Teachers", str(invoice.teacher_count)],
    ]
    
    usage_table = Table(usage_data, colWidths=[200, 150])
    usage_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('BACKGROUND', (0, 1), (-1, -1), COLORS['light_bg']),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(usage_table)
    elements.append(Spacer(1, 10*mm))
    
    # Cost Breakdown
    elements.append(Paragraph("COST BREAKDOWN", heading_style))
    
    cost = invoice.cost_breakdown
    if isinstance(cost, dict):
        cost = CostBreakdown(**cost)
    
    cost_data = [
        ["Description", "Amount"],
        ["Fixed Infrastructure Cost (CPU/RAM)", format_currency(cost.fixed_cost)],
        ["Storage-Based Cost", format_currency(cost.storage_cost)],
        ["Base Subtotal", format_currency(cost.base_total)],
        ["Service Markup", format_currency(cost.markup_amount)],
        ["Subtotal", format_currency(cost.subtotal)],
    ]
    
    # Add manual adjustments if any
    if cost.misc_charges > 0:
        desc = f"Miscellaneous Charges"
        if cost.misc_charges_description:
            desc += f" ({cost.misc_charges_description})"
        cost_data.append([desc, format_currency(cost.misc_charges)])
    
    if cost.crash_recovery_charges > 0:
        cost_data.append(["Crash Recovery Charges", format_currency(cost.crash_recovery_charges)])
    
    if cost.urgent_recovery_charges > 0:
        cost_data.append(["Urgent Recovery Charges", format_currency(cost.urgent_recovery_charges)])
    
    if cost.discount > 0:
        desc = "Discount"
        if cost.discount_description:
            desc += f" ({cost.discount_description})"
        cost_data.append([desc, f"-{format_currency(cost.discount)}"])
    
    # Total row
    cost_data.append(["TOTAL DUE", format_currency(cost.total)])
    
    cost_table = Table(cost_data, colWidths=[300, 100])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), COLORS['light_bg']),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, -1), (-1, -1), COLORS['primary']),
    ]))
    elements.append(cost_table)
    elements.append(Spacer(1, 10*mm))
    
    # Storage Chart (if matplotlib available)
    if MATPLOTLIB_AVAILABLE:
        history = get_storage_history_for_school(invoice.school_id, months=6)
        chart_bytes = create_storage_chart_matplotlib(history, invoice.school_name)
        
        if chart_bytes:
            elements.append(Paragraph("STORAGE USAGE TREND", heading_style))
            chart_image = RLImage(BytesIO(chart_bytes), width=160*mm, height=80*mm)
            elements.append(chart_image)
            elements.append(Spacer(1, 10*mm))
    
    # Notes section
    if invoice.notes:
        elements.append(Paragraph("NOTES", heading_style))
        elements.append(Paragraph(invoice.notes, normal_style))
        elements.append(Spacer(1, 5*mm))
    
    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(HRFlowable(width="100%", thickness=1, color=COLORS['border']))
    elements.append(Spacer(1, 5*mm))
    
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=COLORS['text_muted'],
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
        footer_style
    ))
    elements.append(Paragraph(
        "This is a computer-generated invoice. Thank you for your business.",
        footer_style
    ))
    
    # Build PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    logger.info(f"[PDF] Generated invoice PDF for {invoice.invoice_number} ({len(pdf_bytes)} bytes)")
    return pdf_bytes


def generate_bulk_invoices_pdf(invoices: List[Invoice]) -> bytes:
    """Generate a single PDF containing all invoices"""
    if not REPORTLAB_AVAILABLE:
        raise ImportError("reportlab is required for PDF generation")
    
    if not invoices:
        raise ValueError("No invoices provided")
    
    # For bulk, we'll concatenate individual PDFs
    # In production, this could be optimized
    all_pdf_bytes = []
    
    for invoice in invoices:
        pdf = generate_invoice_pdf(invoice)
        all_pdf_bytes.append(pdf)
    
    # For simplicity, return first invoice PDF
    # In production, use PyPDF2 to merge PDFs
    return all_pdf_bytes[0] if all_pdf_bytes else bytes()


def generate_billing_report_pdf(analytics: dict) -> bytes:
    """Generate billing analytics report PDF"""
    if not REPORTLAB_AVAILABLE:
        raise ImportError("reportlab is required for PDF generation")
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=COLORS['primary'],
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=COLORS['text'],
        spaceBefore=15,
        spaceAfter=8
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=COLORS['text'],
        spaceAfter=4
    )
    
    elements = []
    
    # Header
    elements.append(Paragraph("BILLING ANALYTICS REPORT", title_style))
    elements.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%B %d, %Y')}",
        ParagraphStyle('Small', parent=styles['Normal'], fontSize=9, 
                      textColor=COLORS['text_muted'], alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 10*mm))
    
    # Revenue Summary
    elements.append(Paragraph("REVENUE SUMMARY", heading_style))
    
    revenue = analytics.get("revenue", {})
    revenue_data = [
        ["Metric", "Value"],
        ["Total Predicted Revenue", format_currency(revenue.get("total_predicted_revenue", 0))],
        ["Total MongoDB Cost", format_currency(revenue.get("total_mongo_cost", 0))],
        ["Total Profit", format_currency(revenue.get("total_profit", 0))],
        ["Profit Margin", f"{revenue.get('profit_margin_percentage', 0):.1f}%"],
    ]
    
    revenue_table = Table(revenue_data, colWidths=[250, 150])
    revenue_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(revenue_table)
    elements.append(Spacer(1, 10*mm))
    
    # Invoice Summary
    elements.append(Paragraph("INVOICE SUMMARY", heading_style))
    
    invoice_data = [
        ["Status", "Count"],
        ["Total Invoices", str(analytics.get("total_invoices", 0))],
        ["Draft", str(analytics.get("draft_invoices", 0))],
        ["Pending", str(analytics.get("pending_invoices", 0))],
        ["Paid", str(analytics.get("paid_invoices", 0))],
        ["Overdue", str(analytics.get("overdue_invoices", 0))],
    ]
    
    invoice_table = Table(invoice_data, colWidths=[250, 150])
    invoice_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['secondary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(invoice_table)
    elements.append(Spacer(1, 10*mm))
    
    # Top Schools by Storage
    storage = analytics.get("storage", {})
    top_schools = storage.get("top_schools", [])
    
    if top_schools:
        elements.append(Paragraph("TOP SCHOOLS BY STORAGE", heading_style))
        
        school_data = [["School", "Storage", "Share"]]
        for school in top_schools[:10]:
            school_data.append([
                school.get("school_name", ""),
                format_bytes(school.get("storage_bytes", 0)),
                f"{school.get('percentage', 0):.1f}%"
            ])
        
        school_table = Table(school_data, colWidths=[200, 100, 100])
        school_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['success']),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(school_table)
    
    # Build PDF
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
