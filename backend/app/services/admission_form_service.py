from io import BytesIO
import logging
import base64

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, HRFlowable
from reportlab.lib.colors import HexColor

logger = logging.getLogger(__name__)

COLORS = {
    'primary': HexColor('#0284c7'),
    'text': HexColor('#1e293b'),
    'muted': HexColor('#64748b'),
    'border': HexColor('#e2e8f0'),
    'light_bg': HexColor('#f0f9ff'),  # Very light blue background for registration box
}


def _decode_image_blob(blob_base64: str):
    try:
        return BytesIO(base64.b64decode(blob_base64))
    except Exception:
        return None


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    # Lightweight page counting by scanning for "/Type /Page" markers
    try:
        return pdf_bytes.count(b"/Type /Page")
    except Exception:
        return 0


def generate_admission_pdf(student: dict, school_name: str = None, max_pages: int = 4) -> bytes:
    """
    Generate an admission form PDF for a single student.
    If the generated PDF exceeds `max_pages`, the function will retry with reduced font sizes
    and finally truncate non-essential sections to keep the document within the limit.
    """
    # Log input parameters
    logger.info(f"[ADMISSION PDF] Starting PDF generation for student_id='{student.get('student_id')}', registration_number='{student.get('registration_number')}', school_name='{school_name}'")
    
    buffer = BytesIO()

    # Try multiple scaling factors to fit within max_pages
    scales = [1.0, 0.95, 0.9, 0.85, 0.8]

    # Base styles
    base_styles = getSampleStyleSheet()

    def build_pdf(scale: float, truncate: bool = False) -> bytes:
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            rightMargin=15 * mm,
            leftMargin=15 * mm,
            topMargin=15 * mm,
            bottomMargin=15 * mm,
        )

        title_style = ParagraphStyle(
            'Title', parent=base_styles['Heading1'], fontSize=18 * scale,
            textColor=COLORS['primary'], alignment=TA_CENTER, spaceAfter=6 * mm
        )

        heading_style = ParagraphStyle('Heading', parent=base_styles['Heading2'], fontSize=12 * scale,
                                       textColor=COLORS['text'], spaceAfter=3 * mm, alignment=TA_LEFT)

        normal_style = ParagraphStyle('Normal', parent=base_styles['Normal'], fontSize=10 * scale,
                                      textColor=COLORS['text'], spaceAfter=2 * mm)

        small_style = ParagraphStyle('Small', parent=base_styles['Normal'], fontSize=9 * scale,
                                     textColor=COLORS['muted'], spaceAfter=2 * mm)

        elements = []

        # Header
        elements.append(Paragraph(school_name or 'School', title_style))
        elements.append(Paragraph('Admission Form', heading_style))
        elements.append(Spacer(1, 2 * mm))

        # Registration banner (prominent) - in a clean box with visible text
        reg_no = student.get('registration_number') or student.get('student_id') or 'N/A'
        logger.info(f"[ADMISSION PDF] Registration number extracted: reg_no='{reg_no}' from registration_number='{student.get('registration_number')}', student_id='{student.get('student_id')}'")
        
        # Create a simple two-row layout for the registration banner with explicit text styling
        reg_label_style = ParagraphStyle(
            'RegLabel', 
            parent=base_styles['Normal'], 
            fontSize=11 * scale, 
            fontName='Helvetica-Bold',
            textColor=COLORS['primary'],
            alignment=TA_CENTER,
            spaceAfter=4
        )
        
        reg_value_style = ParagraphStyle(
            'RegValue', 
            parent=base_styles['Normal'], 
            fontSize=16 * scale, 
            fontName='Helvetica-Bold',
            textColor=COLORS['primary'],
            alignment=TA_CENTER,
            spaceBefore=4
        )
        
        reg_inner_table = Table([
            [Paragraph('REGISTRATION NUMBER', reg_label_style)],
            [Paragraph(str(reg_no), reg_value_style)]
        ], colWidths=[150 * mm])
        
        reg_inner_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['light_bg']),
            ('BOX', (0, 0), (-1, -1), 1.5, COLORS['primary']),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [COLORS['light_bg']]),
        ]))
        elements.append(reg_inner_table)
        logger.info(f"[ADMISSION PDF] Registration banner added to PDF: reg_no='{reg_no}'")
        elements.append(Spacer(1, 4 * mm))
        elements.append(Spacer(1, 3 * mm))

        # Student Photo + Basic Info table
        photo = None
        if student.get('profile_image_blob'):
            img_buf = _decode_image_blob(student.get('profile_image_blob'))
            if img_buf:
                try:
                    photo = RLImage(img_buf, width=30 * mm, height=36 * mm)
                except Exception:
                    photo = None

        info_rows = []
        info_rows.append(['Full Name:', student.get('full_name') or student.get('name') or ''])
        info_rows.append(['Registration No:', student.get('registration_number') or student.get('student_id') or ''])
        info_rows.append(['Class / Section:', f"{student.get('class_name') or student.get('class_id','')} / {student.get('section','')}".strip()])
        info_rows.append(['Roll No:', student.get('roll_number') or student.get('roll') or ''])
        info_rows.append(['Date of Birth:', student.get('date_of_birth') or ''])
        info_rows.append(['Gender:', student.get('gender') or ''])

        info_table = Table(info_rows, colWidths=[80 * mm, 80 * mm])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10 * scale),
            ('TEXTCOLOR', (0, 0), (-1, -1), COLORS['text']),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))

        # Layout: put photo on right if present
        if photo:
            elements.append(Table([[info_table, photo]], colWidths=[120 * mm, 40 * mm]))
        else:
            elements.append(info_table)

        elements.append(Spacer(1, 4 * mm))

        # Guardian / Contact Info
        elements.append(Paragraph('Guardian / Contact Information', heading_style))
        contact_rows = []
        contact_rows.append(['Guardian Name:', student.get('guardian_name') or ''])
        contact_rows.append(['Parent CNIC:', student.get('parent_cnic') or student.get('guardian_cnic') or ''])
        contact_rows.append(['Contact Phone:', (student.get('contact_info') or {}).get('phone') or student.get('phone') or ''])
        contact_table = Table(contact_rows, colWidths=[80 * mm, 80 * mm])
        contact_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10 * scale),
            ('TEXTCOLOR', (0, 0), (-1, -1), COLORS['text']),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(contact_table)
        elements.append(Spacer(1, 4 * mm))

        # Academic history / previous school
        elements.append(Paragraph('Previous School / Academic History', heading_style))
        prev_text = student.get('previous_school') or student.get('previous_institution') or 'N/A'
        if truncate:
            # keep shorter when truncating
            prev_text = prev_text[:200]
        elements.append(Paragraph(prev_text, normal_style))
        elements.append(Spacer(1, 4 * mm))

        # Additional Notes (optional)
        notes = student.get('notes') or student.get('remarks') or ''
        if notes:
            if truncate:
                notes = notes[:400]
            elements.append(Paragraph('Additional Notes', heading_style))
            elements.append(Paragraph(notes, small_style))
            elements.append(Spacer(1, 4 * mm))

        # Footer with signature placeholders
        elements.append(Spacer(1, 10 * mm))
        elements.append(HRFlowable(width='100%', thickness=0.6, color=COLORS['border']))
        elements.append(Spacer(1, 3 * mm))
        elements.append(Paragraph('Principal / Headmaster Signature: _______________________', small_style))
        elements.append(Spacer(1, 4 * mm))
        elements.append(Paragraph('Date: ____________________', small_style))

        doc.build(elements)
        return buf.getvalue()

    # Attempt builds with progressively smaller fonts, and finally truncate non-essential text
    for i, s in enumerate(scales):
        pdf_bytes = build_pdf(scale=s, truncate=False)
        pages = _count_pdf_pages(pdf_bytes)
        logger.info(f"[ADMISSION PDF] Attempt with scale={s} produced {pages} pages")
        if pages <= max_pages:
            return pdf_bytes

    # If still too large, try one more build with truncation enabled
    pdf_bytes = build_pdf(scale=scales[-1], truncate=True)
    pages = _count_pdf_pages(pdf_bytes)
    logger.info(f"[ADMISSION PDF] After truncation produced {pages} pages")
    # If still larger than max_pages, we'll return the truncated result anyway (best effort)
    return pdf_bytes
