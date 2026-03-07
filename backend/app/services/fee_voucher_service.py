"""
Fee Voucher Service
Handles fee voucher generation and PDF export for students.
"""

import io
import base64
import zipfile
import logging
from datetime import datetime
from typing import List, Dict, Any

from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

from app.database import get_db
from bson import ObjectId
from app.services.student_fee_service import compute_student_arrears_balance

logger = logging.getLogger(__name__)


def _load_image_from_blob(blob: str) -> PILImage.Image:
    """Load image from blob, handling data-URI and raw base64 formats."""
    if not blob:
        return None

    try:
        # Handle data-URI format: data:image/png;base64,...
        if blob.startswith('data:'):
            # Extract base64 part after comma
            base64_data = blob.split(',', 1)[1]
        else:
            # Assume raw base64
            base64_data = blob

        # Decode base64
        image_data = base64.b64decode(base64_data)

        # Create PIL image from bytes
        image_buffer = io.BytesIO(image_data)
        pil_image = PILImage.open(image_buffer)

        logger.info(f"[FEE_VOUCHER_IMG] ✅ Successfully loaded image: {pil_image.size} mode={pil_image.mode}")
        return pil_image

    except Exception as e:
        logger.error(f"[FEE_VOUCHER_IMG] ❌ Failed to load image from blob: {str(e)}", exc_info=True)
        return None


def _pil_image_to_reportlab_image(pil_img: PILImage.Image, label: str) -> Image:
    """Convert PIL image to ReportLab Image flowable, ensuring RGB mode."""
    if not pil_img:
        return None

    try:
        # Convert to RGB if necessary (ReportLab doesn't handle all PIL modes)
        if pil_img.mode != 'RGB':
            logger.info(f"[FEE_VOUCHER_IMG] Converting {label} from {pil_img.mode} to RGB")
            pil_img = pil_img.convert('RGB')

        # Create BytesIO buffer for ReportLab
        img_buffer = io.BytesIO()
        pil_img.save(img_buffer, format='PNG')  # Save as PNG for consistency
        img_buffer.seek(0)

        # Create ReportLab Image directly from the buffer
        rl_image = Image(img_buffer, width=15*mm, height=15*mm)

        logger.info(f"[FEE_VOUCHER_IMG] ✅ Created ReportLab Image for {label}: {pil_img.size}")
        return rl_image

    except Exception as e:
        logger.error(f"[FEE_VOUCHER_IMG] ❌ Failed to create ReportLab Image for {label}: {str(e)}", exc_info=True)
        return None


class FeeVoucherService:
    """Fee Voucher Service class."""

    def generate_student_fee_voucher_with_photo(self, student_id: str, school_id: str, db=None) -> bytes:
        """Generate a single student's fee voucher PDF with photo."""
        return generate_student_fee_voucher_with_photo(student_id, school_id, db)

    def generate_class_vouchers_combined_pdf(self, class_id: str, school_id: str, db=None) -> bytes:
        """Generate combined PDF for a class."""
        return generate_class_vouchers_combined_pdf(class_id, school_id, db)

    def generate_class_vouchers_zip(self, class_id: str, school_id: str, db=None) -> bytes:
        """Generate ZIP of individual PDFs for a class."""
        return generate_class_vouchers_zip(class_id, school_id, db)


def generate_student_fee_voucher_with_photo(student_id: str, school_id: str, db=None) -> bytes:
    """
    Generate a single student's fee voucher PDF with photo.

    Args:
        student_id: Student ID
        school_id: School ID for isolation
        db: Database connection (optional)

    Returns:
        PDF bytes
    """
    if db is None:
        db = get_db()

    try:
        logger.info(f"[FEE_VOUCHER] Generating voucher for student: {student_id} in school: {school_id}")

        # Get student data
        student = db.students.find_one({"_id": ObjectId(student_id), "school_id": school_id})
        if not student:
            raise ValueError(f"Student {student_id} not found")

        # Get school info
        try:
            from app.services.saas_db import get_saas_root_db
            saas_db = get_saas_root_db()
            school = saas_db.schools.find_one({"school_id": school_id})
            if not school:
                school = db.schools.find_one({"school_id": school_id})
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] Could not fetch school from saas_db: {e}")
            school = None

        school_info = {
            "name": school.get("school_name") or school.get("display_name") or school.get("name", "School") if school else "School",
            "address": school.get("address", "") if school else "",
            "phone": school.get("phone", "") if school else "",
            "email": school.get("email", "") if school else "",
        }

        # Get fee category for student's class
        fee_assignment = db.class_fee_assignments.find_one({
            "school_id": school_id,
            "class_id": student.get("class_id"),
            "is_active": True
        })

        fee_category = None
        fee_components = []

        if fee_assignment:
            category_id = fee_assignment.get("category_id")
            fee_category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
            if fee_category:
                fee_components = fee_category.get("components", [])

        # Generate PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )

        styles = getSampleStyleSheet()
        elements = []

        # Generate voucher elements
        student_elements = _generate_single_voucher_elements(
            student,
            school_info,
            fee_components,
            student.get("class_id"),
            styles,
            db,
            doc
        )
        elements.extend(student_elements)

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()

        # Validate PDF
        if not pdf_bytes or len(pdf_bytes) < 100:
            raise ValueError(f"Generated PDF is too small ({len(pdf_bytes)} bytes)")

        if not pdf_bytes.startswith(b'%PDF'):
            raise ValueError("Generated file is not a valid PDF")

        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated voucher PDF ({len(pdf_bytes)} bytes)")
        return pdf_bytes

    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error generating student voucher: {str(e)}", exc_info=True)
        raise


def _generate_single_voucher_elements(
    student: dict,
    school_info: dict,
    fee_components: list,
    class_id: str,
    styles,
    db,
    doc
) -> list:
    """
    Helper function to generate 3-column voucher elements for a single student.
    Creates Office Copy | Student Copy | Notice Copy layout.
    Returns a list of reportlab elements.
    """
    from reportlab.lib.pagesizes import A4, landscape
    page_width, page_height = landscape(A4)

    # Compute usable width based on document margins used by combined PDF (15mm each)
    column_gap = 3 * mm
    doc_side_margin = 15 * mm
    usable_width = page_width - (doc_side_margin * 2) - (column_gap * 2)
    # Scale overall content to 97% of usable width to make voucher nearly full-width
    scale_factor = 0.97
    scaled_usable = usable_width * scale_factor
    # Column width (3 columns with small gaps)
    col_width = scaled_usable / 3
    # Available width for inner content (accounting for column paddings)
    content_w = col_width - 10*mm
    # Inner content further reduced so inner tables' borders fit inside the outer column padding
    inner_content_w = content_w - 8*mm

    # Prefer using the student's generated monthly fee if available (includes arrears and scholarship)
    total_fee = sum(comp.get("amount", 0) for comp in fee_components)

    # Ensure we have school_id and a string student id before querying monthly fee records
    school_id = student.get("school_id", "")

    try:
        # Determine student id string (use string form of ObjectId if present)
        sid = student.get("_id")
        try:
            sid = str(sid)
        except Exception:
            pass

        now = datetime.utcnow()
        monthly_fee = db.student_monthly_fees.find_one({
            "school_id": school_id,
            "student_id": sid,
            "month": now.month,
            "year": now.year
        })

        if monthly_fee:
            # If monthly fee record exists, use its components and totals for accuracy
            # Components on the monthly fee (if present) are the canonical breakdown
            if monthly_fee.get("components"):
                fee_components = monthly_fee.get("components")
                total_fee = sum(comp.get("amount", 0) for comp in fee_components)
            else:
                # Fall back to base_fee if components missing
                total_fee = monthly_fee.get("fee_after_discount") or monthly_fee.get("base_fee") or total_fee

            # Also expose monthly fee summary values for later rows
            monthly_scholarship_percent = monthly_fee.get("scholarship_percent", student.get("scholarship_percent", 0) or 0)
            monthly_scholarship_amount = monthly_fee.get("scholarship_amount", 0)
            monthly_arrears_added = monthly_fee.get("arrears_added", 0)
            monthly_amount_paid = monthly_fee.get("amount_paid", 0)
            monthly_final_fee = monthly_fee.get("final_fee", total_fee - monthly_scholarship_amount + monthly_arrears_added)
        else:
            monthly_scholarship_percent = student.get("scholarship_percent", 0) or 0
            monthly_scholarship_amount = (total_fee * monthly_scholarship_percent) / 100 if monthly_scholarship_percent else 0
            # If no monthly record exists, compute arrears from monthly fee records to get accurate carried amounts
            try:
                student_id_for_arrears = sid
                monthly_arrears_added = float(compute_student_arrears_balance(student_id_for_arrears, school_id))
            except Exception:
                monthly_arrears_added = student.get("arrears", 0) or student.get("arrears_balance", 0) or 0
            monthly_amount_paid = 0
            monthly_final_fee = total_fee - monthly_scholarship_amount + monthly_arrears_added

    except Exception as e:
        logger.warning(f"[FEE_VOUCHER] Could not load monthly fee for student when generating voucher: {e}")
        monthly_scholarship_percent = student.get("scholarship_percent", 0) or 0
        monthly_scholarship_amount = (total_fee * monthly_scholarship_percent) / 100 if monthly_scholarship_percent else 0
        monthly_arrears_added = student.get("arrears", 0) or student.get("arrears_balance", 0) or 0
        monthly_amount_paid = 0
        monthly_final_fee = total_fee - monthly_scholarship_amount + monthly_arrears_added

    # Fetch school_id from student
    school_id = student.get("school_id", "")

    # Fetch voucher settings (header/footer/images) from database
    voucher_settings = None
    custom_header = ""
    custom_footer = ""
    school_name = ""
    left_image_data = None
    right_image_data = None
    try:
        voucher_settings = db.fee_voucher_settings.find_one({"school_id": school_id})
        if voucher_settings:
            custom_header = voucher_settings.get("header_text", "") or ""
            custom_footer = voucher_settings.get("footer_text", "") or ""
            school_name = voucher_settings.get("school_name", "") or ""

            # Decode left image if available (robustly handle data-URLs)
            left_image_blob = voucher_settings.get("left_image_blob")
            if left_image_blob:
                try:
                    logger.info(f"[FEE_VOUCHER_IMG] 🔍 Batch: Loading left image blob (len:{len(left_image_blob)})")
                    left_image_data = _load_image_from_blob(left_image_blob)
                    if left_image_data:
                        logger.info(f"[FEE_VOUCHER_IMG] ✅ Batch: Left image loaded successfully, size: {left_image_data.size}")
                    else:
                        logger.warning(f"[FEE_VOUCHER_IMG] ⚠️ Batch: _load_image_from_blob returned None for left image")
                except Exception as e:
                    logger.error(f"[FEE_VOUCHER_IMG] ❌ Batch: Could not load left image: {str(e)}", exc_info=True)
            else:
                logger.info(f"[FEE_VOUCHER_IMG] ⚠️ Batch: No left_image_blob provided")

            # Decode right image if available (robustly handle data-URLs)
            right_image_blob = voucher_settings.get("right_image_blob")
            if right_image_blob:
                try:
                    logger.info(f"[FEE_VOUCHER_IMG] 🔍 Batch: Loading right image blob (len:{len(right_image_blob)})")
                    right_image_data = _load_image_from_blob(right_image_blob)
                    if right_image_data:
                        logger.info(f"[FEE_VOUCHER_IMG] ✅ Batch: Right image loaded successfully, size: {right_image_data.size}")
                    else:
                        logger.warning(f"[FEE_VOUCHER_IMG] ⚠️ Batch: _load_image_from_blob returned None for right image")
                except Exception as e:
                    logger.error(f"[FEE_VOUCHER_IMG] ❌ Batch: Could not load right image: {str(e)}", exc_info=True)
            else:
                logger.info(f"[FEE_VOUCHER_IMG] ⚠️ Batch: No right_image_blob provided")
    except Exception as e:
        logger.warning(f"[FEE_VOUCHER] Could not fetch voucher settings: {e}")

    # Look up class document to get proper class name
    class_name = "N/A"
    if class_id:
        try:
            class_doc = db.classes.find_one({"_id": ObjectId(class_id)})
            if class_doc:
                class_name = class_doc.get("class_name", class_doc.get("name", "N/A"))
                section = class_doc.get("section", "")
                if section:
                    class_name = f"{class_name} - {section}"
            else:
                class_doc = db.classes.find_one({"class_id": class_id})
                if class_doc:
                    class_name = class_doc.get("class_name", class_doc.get("name", "N/A"))
                    section = class_doc.get("section", "")
                    if section:
                        class_name = f"{class_name} - {section}"
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] Could not lookup class: {e}")
            class_name = str(class_id) if class_id else "N/A"

    # Prepare student photo if available
    logger.info(f"[FEE_VOUCHER] 📸 Loading student photo from profile")
    photo_data = None
    if student.get("profile_image_blob"):
        try:
            image_data = base64.b64decode(student["profile_image_blob"])
            image_buffer = io.BytesIO(image_data)
            photo_data = PILImage.open(image_buffer)
            logger.info(f"[FEE_VOUCHER] ✅ Student photo loaded: {photo_data.size}")
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] ⚠️ Could not load student photo: {str(e)}")
    else:
        sid = student.get("_id")
        try:
            sid = str(sid)
        except Exception:
            pass
        logger.info(f"[FEE_VOUCHER] ⚠️ No profile image blob for student {sid}")

    # Create the three columns: Bank Copy, Student Copy, Office Copy
    logger.info(f"[FEE_VOUCHER] 📄 Creating 3-column layout (Office, Student, Notice)")
    columns = []

    # Use reduced font scale by default (0.85x) for compact appearance
    font_scale = 0.85
    max_attempts = 3
    attempt = 0

    while attempt < max_attempts:
        try:
            logger.info(f"[FEE_VOUCHER] Attempting to fit with font_scale={font_scale:.2f}")

            # Create each column with current font_scale
            office_copy = create_voucher_copy(
                "Office Copy",
                font_scale,
                left_image_data,
                right_image_data,
                school_name,
                custom_header,
                custom_footer,
                student,
                class_name,
                fee_components,
                total_fee,
                photo_data,
                styles,
                inner_content_w,
                content_w,
                page_height,
                doc,
                locals().get('monthly_scholarship_percent', 0),
                locals().get('monthly_scholarship_amount', 0),
                locals().get('monthly_arrears_added', 0),
                locals().get('monthly_amount_paid', 0),
                locals().get('monthly_final_fee', None)
            )
            student_copy = create_voucher_copy(
                "Student Copy",
                font_scale,
                left_image_data,
                right_image_data,
                school_name,
                custom_header,
                custom_footer,
                student,
                class_name,
                fee_components,
                total_fee,
                photo_data,
                styles,
                inner_content_w,
                content_w,
                page_height,
                doc,
                locals().get('monthly_scholarship_percent', 0),
                locals().get('monthly_scholarship_amount', 0),
                locals().get('monthly_arrears_added', 0),
                locals().get('monthly_amount_paid', 0),
                locals().get('monthly_final_fee', None)
            )
            notice_copy = create_voucher_copy(
                "Notice Copy",
                font_scale,
                left_image_data,
                right_image_data,
                school_name,
                custom_header,
                custom_footer,
                student,
                class_name,
                fee_components,
                total_fee,
                photo_data,
                styles,
                inner_content_w,
                content_w,
                page_height,
                doc,
                locals().get('monthly_scholarship_percent', 0),
                locals().get('monthly_scholarship_amount', 0),
                locals().get('monthly_arrears_added', 0),
                locals().get('monthly_amount_paid', 0),
                locals().get('monthly_final_fee', None)
            )

            columns = [office_copy, student_copy, notice_copy]

            # Check if all columns fit
            all_fit = True
            max_col_h = page_height - (doc.topMargin + doc.bottomMargin) - (15 * mm)
            for idx, col in enumerate(columns):
                if hasattr(col, 'wrap'):
                    w, h = col.wrap(col_width, page_height)
                    logger.info(f"[FEE_VOUCHER] Column {idx} height: {h:.1f}mm (max: {max_col_h:.1f}mm)")
                    if h > max_col_h:
                        all_fit = False
                        break

            if all_fit:
                logger.info(f"[FEE_VOUCHER] ✅ Content fits with font_scale={font_scale:.2f}")
                break
            else:
                font_scale *= 0.92  # Reduce font size by 8%
                attempt += 1
                logger.info(f"[FEE_VOUCHER] ⚠️ Content too tall, trying smaller font_scale={font_scale:.2f}")

        except Exception as e:
            logger.error(f"[FEE_VOUCHER] ❌ Error during fitting attempt {attempt}: {str(e)}", exc_info=True)
            font_scale *= 0.92
            attempt += 1

    if attempt >= max_attempts:
        logger.warning(f"[FEE_VOUCHER] ⚠️ Could not fit content after {max_attempts} attempts, using font_scale={font_scale:.2f}")

    # Create main table with 3 columns and dotted separators between them
    logger.info(f"[FEE_VOUCHER] 🔲 Creating 3-column table with dotted separators")
    main_table = Table([columns], colWidths=[col_width, col_width, col_width])
    main_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        # Dotted separators between columns (no vertical lines at borders)
        ('LINEABOVE', (0, 0), (-1, -1), 0, colors.white),
        ('LINEBELOW', (0, 0), (-1, -1), 0, colors.white),
        ('LINELEFT', (0, 0), (-1, -1), 0, colors.white),
        ('LINERIGHT', (0, 0), (-1, -1), 0, colors.white),
        # Separator between Bank Copy and Student Copy (thin grey line)
        ('LINEAFTER', (0, 0), (0, -1), 0.5, colors.grey),
        # Separator between Student Copy and Office Copy (thin grey line)
        ('LINEAFTER', (1, 0), (1, -1), 0.5, colors.grey),
    ]))

    return [main_table]


def create_voucher_copy(
    copy_title: str,
    font_scale: float,
    left_image_data,
    right_image_data,
    school_name,
    custom_header,
    custom_footer,
    student,
    class_name,
    fee_components,
    total_fee,
    photo_data,
    styles,
    inner_content_w,
    content_w,
    page_height,
    doc,
    monthly_scholarship_percent: float = 0,
    monthly_scholarship_amount: float = 0,
    monthly_arrears_added: float = 0,
    monthly_amount_paid: float = 0,
    monthly_final_fee = None
):
    """Create a single voucher copy for one column. Includes student photo, reduced spacing, and one-line signature layout. `font_scale` scales font sizes for auto-fit.

    The function now accepts precomputed monthly values for scholarship and arrears so
    the PDF shows consistent calculations with the UI.
    """
    copy_elements = []
    logger.info(f"[FEE_VOUCHER] Creating {copy_title} with font_scale={font_scale:.2f}, photo_available={photo_data is not None}")

    # Copy header (Bank Copy / Student Copy / Office Copy)
    header_style = ParagraphStyle(
        'CopyHeader',
        parent=styles['Normal'],
        fontSize=7 * font_scale,  # Reduced from 8
        alignment=TA_CENTER,
        textColor=colors.white,
        fontName='Helvetica-Bold'
    )

    copy_header = Table(
        [[Paragraph(copy_title, header_style)]],
        colWidths=[inner_content_w]
    )
    copy_header.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1a365d')),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),  # Reduced from 3
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),  # Reduced from 3
    ]))
    copy_elements.append(copy_header)
    logger.info(f"[FEE_VOUCHER] Added {copy_title} header")

    # School name with left/right images in header row
    logger.info(f"[FEE_VOUCHER_IMG] 📋 Creating header for {copy_title}: left_img={left_image_data is not None}, right_img={right_image_data is not None}, school={school_name}")
    header_row_elements = []

    # Left image (if available)
    if left_image_data:
        try:
            logger.info(f"[FEE_VOUCHER_IMG] 🖼️ Adding left image to {copy_title}")
            left_img = _pil_image_to_reportlab_image(left_image_data, label=f"left image for {copy_title}")
            if left_img:
                header_row_elements.append(left_img)
                logger.info(f"[FEE_VOUCHER_IMG] ✅ Left image added successfully to {copy_title}")
            else:
                logger.warning(f"[FEE_VOUCHER_IMG] ⚠️ Image creation failed for left image of {copy_title}")
                header_row_elements.append(Spacer(15*mm, 15*mm))
        except Exception as e:
            logger.error(f"[FEE_VOUCHER_IMG] ❌ Could not create left image for {copy_title}: {e}", exc_info=True)
            header_row_elements.append(Spacer(15*mm, 15*mm))
    else:
        logger.info(f"[FEE_VOUCHER_IMG] ⚠️ No left image, adding spacer to {copy_title}")
        header_row_elements.append(Spacer(15*mm, 15*mm))

    # School name (center)
    school_name_style = ParagraphStyle(
        'SchoolName',
        parent=styles['Normal'],
        fontSize=7 * font_scale,  # Reduced from 8
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a365d'),
        fontName='Helvetica-Bold',
        spaceAfter=0,
        spaceBefore=0
    )
    if school_name:
        header_row_elements.append(Paragraph(school_name, school_name_style))
    else:
        header_row_elements.append(Spacer(1*mm, 1*mm))

    # Right image (if available)
    if right_image_data:
        try:
            logger.info(f"[FEE_VOUCHER_IMG] 🖼️ Adding right image to {copy_title}")
            right_img = _pil_image_to_reportlab_image(right_image_data, label=f"right image for {copy_title}")
            if right_img:
                header_row_elements.append(right_img)
                logger.info(f"[FEE_VOUCHER_IMG] ✅ Right image added successfully to {copy_title}")
            else:
                logger.warning(f"[FEE_VOUCHER_IMG] ⚠️ Image creation failed for right image of {copy_title}")
                header_row_elements.append(Spacer(15*mm, 15*mm))
        except Exception as e:
            logger.error(f"[FEE_VOUCHER_IMG] ❌ Could not create right image for {copy_title}: {e}", exc_info=True)
            header_row_elements.append(Spacer(15*mm, 15*mm))
    else:
        logger.info(f"[FEE_VOUCHER_IMG] ⚠️ No right image, adding spacer to {copy_title}")
        header_row_elements.append(Spacer(15*mm, 15*mm))

    # Assemble header row table
    header_row_table = Table(
        [header_row_elements],
        colWidths=[18*mm, inner_content_w - 36*mm, 18*mm]
    )
    header_row_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
    ]))
    copy_elements.append(header_row_table)
    # Reserve fixed header spacing so header area is consistent across vouchers
    copy_elements.append(Spacer(1, 2.5*mm))

    # Fee Voucher centered title - smaller font, reduced spacing
    title_style = ParagraphStyle(
        'VoucherTitle',
        parent=styles['Heading2'],
        fontSize=7 * font_scale,  # Reduced from 8
        alignment=TA_CENTER,
        textColor=colors.HexColor('#2c5282'),
        spaceAfter=0.3*mm,  # Reduced from 0.5mm
        spaceBefore=0.3*mm  # Reduced from 0.5mm
    )
    copy_elements.append(Paragraph("<b>Fee Voucher</b>", title_style))

    # Custom header (if provided) - directly under Fee Voucher
    if custom_header:
        header_custom_style = ParagraphStyle('CustomHeader', parent=styles['Normal'], fontSize=5.5 * font_scale, alignment=TA_CENTER, textColor=colors.HexColor('#333333'), fontName='Helvetica-Bold', spaceAfter=0.3*mm, spaceBefore=0)
        copy_elements.append(Paragraph(custom_header, header_custom_style))

    # Student photo now shown next to student details (see info_photo_table below)
    logger.info(f"[FEE_VOUCHER] Photo data available: {photo_data is not None}")

    # Student info section
    info_style = ParagraphStyle('Info', parent=styles['Normal'], fontSize=6 * font_scale, leading=7 * font_scale)  # Reduced from 7/9
    bold_style = ParagraphStyle('BoldInfo', parent=styles['Normal'], fontSize=6 * font_scale, leading=7 * font_scale, fontName='Helvetica-Bold')  # Reduced from 7/9

    guardian_info = student.get("guardian_info") or {}
    father_name = guardian_info.get("father_name") or guardian_info.get("name") or "N/A"
    father_cnic = guardian_info.get("father_cnic") or guardian_info.get("cnic") or guardian_info.get("nic") or "N/A"
    registration_number = student.get("registration_number") or student.get("student_id") or "N/A"

    student_info_rows = [
        [Paragraph("<b>Reg #:</b>", bold_style), Paragraph(str(registration_number), info_style)],
        [Paragraph("<b>Name:</b>", bold_style), Paragraph(student.get("full_name", "N/A"), info_style)],
        [Paragraph("<b>Father:</b>", bold_style), Paragraph(father_name, info_style)],
        [Paragraph("<b>CNIC:</b>", bold_style), Paragraph(str(father_cnic), info_style)],
        [Paragraph("<b>Class:</b>", bold_style), Paragraph(class_name, info_style)],
        [Paragraph("<b>Roll #:</b>", bold_style), Paragraph(str(student.get("roll_number", "N/A")), info_style)],
    ]

    info_table = Table(student_info_rows, colWidths=[14*mm, inner_content_w - 18*mm])  # Reduced label column
    info_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 5.5 * font_scale),  # Reduced from 6
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0.2),  # Reduced from 0.5
        ('TOPPADDING', (0, 0), (-1, -1), 0.2),  # Reduced from 0.5
    ]))
    
    # Include student photo if available
    if photo_data:
        try:
            logger.info(f"[FEE_VOUCHER] 📸 Adding student photo to {copy_title}")
            photo_element = _pil_image_to_reportlab_image(photo_data, label=f"student photo for {copy_title}")
            if photo_element:
                # Photo on the right side of student info
                info_photo_row = [[info_table, photo_element]]
                info_photo_table = Table(info_photo_row, colWidths=[inner_content_w - 18*mm, 18*mm])
                logger.info(f"[FEE_VOUCHER] ✅ Student photo added to {copy_title}")
            else:
                # No photo, use full width
                info_photo_row = [[info_table]]
                info_photo_table = Table(info_photo_row, colWidths=[inner_content_w])
                logger.warning(f"[FEE_VOUCHER] Photo creation failed for {copy_title}")
        except Exception as e:
            logger.error(f"[FEE_VOUCHER] ❌ Error adding photo to {copy_title}: {str(e)}", exc_info=True)
            info_photo_row = [[info_table]]
            info_photo_table = Table(info_photo_row, colWidths=[inner_content_w])
    else:
        info_photo_row = [[info_table]]
        info_photo_table = Table(info_photo_row, colWidths=[inner_content_w])

    info_photo_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 1),  # Reduced from 2
        ('RIGHTPADDING', (0, 0), (-1, -1), 1),  # Reduced from 2
        ('TOPPADDING', (0, 0), (-1, -1), 2),  # Reduced from 4
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),  # Reduced from 4
    ]))
    copy_elements.append(info_photo_table)
    copy_elements.append(Spacer(1, 0.8*mm))  # Further reduced from 1.5mm
    logger.info(f"[FEE_VOUCHER] Added student info section to {copy_title}")

    # Fee details header - compact, reduced font
    fee_header_style = ParagraphStyle('FeeHeader', parent=styles['Normal'], fontSize=5.5 * font_scale, fontName='Helvetica-Bold', textColor=colors.white)  # Reduced from 6
    fee_item_style = ParagraphStyle('FeeItem', parent=styles['Normal'], fontSize=5.5 * font_scale)  # Reduced from 6
    fee_amount_style = ParagraphStyle('FeeAmount', parent=styles['Normal'], fontSize=5.5 * font_scale, alignment=TA_RIGHT)  # Reduced from 6

    # Fee table rows
    fee_rows = [
        [Paragraph("<b>Description</b>", fee_header_style), Paragraph("<b>Amount</b>", fee_header_style)]
    ]

    # Embed a sub-table that shows the fee category breakdown (up to 6 attribute rows)
    category_name = None
    try:
        # Attempt to read a category name if available on components or fee_category
        if isinstance(fee_components, dict):
            category_name = fee_components.get('category_name')
        # If fee_components is a list of component dicts, category_name may be present on the parent
    except Exception:
        category_name = None

    # Build category breakdown table data
    cat_table_data = [[Paragraph('<b>Attribute</b>', fee_header_style), Paragraph('<b>Amount</b>', fee_header_style)]]

    if fee_components and isinstance(fee_components, list) and len(fee_components) > 0:
        # Add up to 6 attribute rows; fill empty rows if fewer
        for comp in fee_components[:6]:
            comp_name = comp.get('component_name', comp.get('name', ''))
            comp_amount = comp.get('amount', 0)
            cat_table_data.append([Paragraph(comp_name or '', fee_item_style), Paragraph(f"Rs. {comp_amount:,.0f}", fee_amount_style)])

        # If less than 6 attributes, pad empty rows to keep space consistent
        for _ in range(6 - min(6, len(fee_components))):
            cat_table_data.append([Paragraph('', fee_item_style), Paragraph('', fee_amount_style)])
    else:
        # No components; show empty attribute rows
        for _ in range(6):
            cat_table_data.append([Paragraph('', fee_item_style), Paragraph('', fee_amount_style)])

    # Category total calculation (sum of components)
    try:
        category_total = sum((c.get('amount', 0) for c in fee_components)) if isinstance(fee_components, list) else total_fee
    except Exception:
        category_total = total_fee

    # Create a compact, minimal nested table and constrain its width so it never overflows
    # First row is header, following 6 rows are attribute rows
    header_row_height = 6 * mm
    attr_row_height = 5.0 * mm
    row_heights = [header_row_height] + [attr_row_height] * 6

    # Left cell width in the main fee table (first column) - use this to constrain nested table
    left_cell_width = inner_content_w * 0.65
    # Reserve small padding inside left cell for nested table
    nested_total_width = left_cell_width - (3 * mm)
    # Distribute nested columns as 70/30 of nested_total_width
    nested_left_col = nested_total_width * 0.70
    nested_right_col = nested_total_width * 0.30

    # Minimal styling: no heavy outer box, subtle lines, smaller font to avoid wrapping
    category_table = Table(cat_table_data, colWidths=[nested_left_col, nested_right_col], rowHeights=row_heights)
    category_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 4.6 * font_scale),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#264873')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#1f4b6b')),
        ('INNERGRID', (0, 1), (-1, -1), 0.2, colors.HexColor('#d1d5db')),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))

    # Add the category table as the first row in the main fee table (left cell contains nested table)
    fee_rows.append([
        category_table,
        Paragraph(f"Rs. {category_total:,.0f}", fee_amount_style)
    ])

    # Scholarship discount row (use monthly data when available)
    scholarship_percent = monthly_scholarship_percent if monthly_scholarship_percent is not None else (student.get('scholarship_percent', 0) or 0)
    scholarship_amount = monthly_scholarship_amount if monthly_scholarship_amount is not None else ((total_fee * scholarship_percent) / 100 if scholarship_percent else 0)

    # Use base fee for later calculations
    base_fee = total_fee

    # Scholarship row (always show scholarship percent and amount)
    scholarship_style = ParagraphStyle('ScholarshipItem', parent=styles['Normal'], fontSize=5.5 * font_scale, textColor=colors.HexColor('#22543d'))
    scholarship_amount_style = ParagraphStyle('ScholarshipAmount', parent=styles['Normal'], fontSize=5.5 * font_scale, alignment=TA_RIGHT, textColor=colors.HexColor('#22543d'))
    fee_rows.append([
        Paragraph(f"Scholarship ({scholarship_percent:.0f}%)", scholarship_style),
        Paragraph(f"−Rs. {scholarship_amount:,.0f}", scholarship_amount_style)
    ])

    # Arrears row (ALWAYS show, even if 0) - prefer provided monthly_arrears_added
    arrears_amount = monthly_arrears_added if monthly_arrears_added is not None else 0
    fee_rows.append([
        Paragraph("Arrears", fee_item_style),
        Paragraph(f"Rs. {arrears_amount:,.0f}", fee_amount_style)
    ])

    # Amount Paid row
    amount_paid = monthly_amount_paid if monthly_amount_paid is not None else 0
    fee_rows.append([
        Paragraph("Amount Paid", fee_item_style),
        Paragraph(f"Rs. {amount_paid:,.0f}", fee_amount_style)
    ])

    # Remaining amount (final - paid)
    if monthly_final_fee is not None:
        remaining_amount = monthly_final_fee - amount_paid
    else:
        remaining_amount = (base_fee - scholarship_amount + arrears_amount) - amount_paid

    fee_rows.append([
        Paragraph("Remaining", fee_item_style),
        Paragraph(f"Rs. {remaining_amount:,.0f}", fee_amount_style)
    ])

    # Total / Grand Total row (include arrears, subtract scholarship)
    total_with_arrears = monthly_final_fee if monthly_final_fee is not None else (base_fee - scholarship_amount + arrears_amount)
    total_style = ParagraphStyle('Total', parent=styles['Normal'], fontSize=7 * font_scale, fontName='Helvetica-Bold')
    total_amount_style = ParagraphStyle('TotalAmount', parent=styles['Normal'], fontSize=7 * font_scale, fontName='Helvetica-Bold', alignment=TA_RIGHT)
    fee_rows.append([
        Paragraph("<b>GRAND TOTAL</b>", total_style),
        Paragraph(f"<b>Rs. {total_with_arrears:,.0f}</b>", total_amount_style)
    ])

    fee_table = Table(fee_rows, colWidths=[inner_content_w * 0.65, inner_content_w * 0.35])

    # Style for fee table - compact with reduced row spacing
    table_style = [
        ('FONTSIZE', (0, 0), (-1, -1), 5.5 * font_scale),  # Reduced from 6
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.black),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.grey),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8),  # Reduced from 2
        ('TOPPADDING', (0, 0), (-1, -1), 0.8),  # Reduced from 2
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e6f2ff')),
    ]
    fee_table.setStyle(TableStyle(table_style))
    copy_elements.append(fee_table)
    copy_elements.append(Spacer(1, 0.8*mm))  # Further reduced from 2mm
    logger.info(f"[FEE_VOUCHER] Added fee table to {copy_title} with {len(fee_components)} components")

    # Issue/Due date row
    date_style = ParagraphStyle('DateInfo', parent=styles['Normal'], fontSize=5 * font_scale)  # Reduced from 5.5
    issue_dt = datetime.now()
    due_date_obj = issue_dt.replace(day=28)  # Default due date
    date_row = Table([
        [Paragraph(f"<b>Issue:</b> {issue_dt.strftime('%d/%m/%Y')}", date_style),
         Paragraph(f"<b>Due:</b> {due_date_obj.strftime('%d/%m/%Y')}", date_style)]
    ], colWidths=[inner_content_w / 2, inner_content_w / 2])
    date_row.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 5 * font_scale),  # Reduced from 6
    ]))
    copy_elements.append(date_row)
    copy_elements.append(Spacer(1, 0.6*mm))  # Further reduced from 1.5mm

    # Custom footer (if provided)
    if custom_footer:
        footer_custom_style = ParagraphStyle('CustomFooter', parent=styles['Normal'], fontSize=5 * font_scale, alignment=TA_CENTER, textColor=colors.HexColor('#444444'), fontName='Helvetica-Oblique', leading=6 * font_scale)  # Reduced from 6/7
        copy_elements.append(Paragraph(custom_footer, footer_custom_style))
        copy_elements.append(Spacer(1, 0.5*mm))  # Further reduced from 1.5mm

    # Reserve fixed footer space before signature/stamp area
    copy_elements.append(Spacer(1, 4*mm))

    # One-line signature layout: Accountant (left) and Bank Stamp (right) with underlines
    logger.info(f"[FEE_VOUCHER] Adding signature/stamp line to {copy_title}")
    sig_stamp_style = ParagraphStyle('SigStamp', parent=styles['Normal'], fontSize=5 * font_scale, alignment=TA_CENTER)  # Reduced from 5.5
    
    # Create a single row with two cells: left for signature, right for stamp
    sig_left_width = inner_content_w * 0.48
    sig_right_width = inner_content_w * 0.48
    
    sig_label = Paragraph("<b>Accountant Signature</b>", sig_stamp_style)
    stamp_label = Paragraph("<b>Bank Stamp</b>", sig_stamp_style)
    
    # Combine labels in one row
    labels_row = Table([[sig_label, stamp_label]], colWidths=[sig_left_width, sig_right_width])
    labels_row.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    copy_elements.append(labels_row)
    copy_elements.append(Spacer(1, 0.3*mm))
    
    # Add underlines for filling
    # Draw horizontal lines under each label using table cell borders
    underline_table = Table([['', '']], colWidths=[sig_left_width, sig_right_width])
    underline_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (0, 0), 0.6, colors.black),
        ('LINEABOVE', (1, 0), (1, 0), 0.6, colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    copy_elements.append(underline_table)
    logger.info(f"[FEE_VOUCHER] Added one-line signature/stamp layout to {copy_title}")

    # Combine all elements into a single column table - no outer box border
    column_table = Table([[elem] for elem in copy_elements], colWidths=[content_w])
    column_table.setStyle(TableStyle([
        # No outer box - columns separated by dotted lines in main table
        ('LEFTPADDING', (0, 0), (-1, -1), 2),  # Reduced from 3
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),  # Reduced from 3
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),  # Reduced from 2
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),  # Reduced from 2
    ]))

    # Auto-fit: if column height exceeds available printable height, reduce padding
    try:
        max_col_h = page_height - (doc.topMargin + doc.bottomMargin) - (15 * mm)
        w, h = column_table.wrap(content_w, max_col_h)
        logger.info(f"[FEE_VOUCHER] {copy_title} wrapped height: {h:.1f}mm (max: {max_col_h:.1f}mm)")
        if h > max_col_h:
            logger.warning(f"[FEE_VOUCHER] {copy_title} too tall ({h:.1f} > {max_col_h:.1f}), reducing paddings to fit")
            column_table.setStyle(TableStyle([
                ('TOPPADDING', (0, 0), (-1, -1), 0.8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8),
                ('LEFTPADDING', (0, 0), (-1, -1), 1),
                ('RIGHTPADDING', (0, 0), (-1, -1), 1),
            ]))
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] Error during auto-fit sizing: {str(e)}", exc_info=True)

    logger.info(f"[FEE_VOUCHER] ✅ {copy_title} created successfully")
    return column_table


def generate_class_vouchers_combined_pdf(
    class_id: str,
    school_id: str,
    db = None
) -> bytes:
    """
    Generate a single PDF containing vouchers for all students in a class (one per page).

    Args:
        class_id: Class ID
        school_id: School ID for isolation
        db: Database connection (optional)

    Returns:
        Combined PDF bytes
    """
    if db is None:
        db = get_db()

    try:
        logger.info(f"[FEE_VOUCHER] Generating combined PDF for class: {class_id} in school: {school_id}")

        # Get all active students in the class
        students = list(db.students.find({
            "class_id": class_id,
            "school_id": school_id,
            "status": "active"
        }).sort("roll_number", 1))

        if not students:
            logger.warning(f"[FEE_VOUCHER] No students found in class {class_id}")
            raise ValueError("No students found in this class")

        # Get school info once - School IDs are strings in saas_root_db
        try:
            from app.services.saas_db import get_saas_root_db
            saas_db = get_saas_root_db()
            school = saas_db.schools.find_one({"school_id": school_id})
            if not school:
                school = db.schools.find_one({"school_id": school_id})
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] Could not fetch school from saas_db: {e}")
            school = None

        school_info = {
            "name": school.get("school_name") or school.get("display_name") or school.get("name", "School") if school else "School",
            "address": school.get("address", "") if school else "",
            "phone": school.get("phone", "") if school else "",
            "email": school.get("email", "") if school else "",
        }

        logger.info(f"[FEE_VOUCHER] School info for combined PDF: {school_info['name']}")

        # Get fee category for the class
        fee_assignment = db.class_fee_assignments.find_one({
            "school_id": school_id,
            "class_id": class_id,
            "is_active": True
        })

        fee_category = None
        fee_components = []

        if fee_assignment:
            category_id = fee_assignment.get("category_id")
            fee_category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
            if fee_category:
                fee_components = fee_category.get("components", [])

        # Create combined PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )

        styles = getSampleStyleSheet()
        elements = []

        # Generate voucher for each student
        for idx, student in enumerate(students):
            if idx > 0:
                # Add page break between students
                elements.append(PageBreak())

            try:
                # Generate voucher elements for this student
                student_elements = _generate_single_voucher_elements(
                    student,
                    school_info,
                    fee_components,
                    class_id,
                    styles,
                    db,
                    doc
                )
                elements.extend(student_elements)

                logger.info(f"[FEE_VOUCHER] Added voucher for {student.get('full_name')} to combined PDF")

            except Exception as e:
                logger.error(f"[FEE_VOUCHER] ❌ Failed to add voucher for student: {str(e)}", exc_info=True)
                # Continue with other students
                continue

        # Build PDF
        try:
            doc.build(elements)
            buffer.seek(0)
            pdf_bytes = buffer.getvalue()

            # Validate PDF
            if not pdf_bytes or len(pdf_bytes) < 100:
                raise ValueError(f"Generated combined PDF is too small ({len(pdf_bytes)} bytes)")

            if not pdf_bytes.startswith(b'%PDF'):
                raise ValueError("Generated file is not a valid PDF")

            logger.info(f"[FEE_VOUCHER] ✅ Successfully generated combined PDF with {len(students)} vouchers ({len(pdf_bytes)} bytes)")
            return pdf_bytes
        except Exception as e:
            logger.error(f"[FEE_VOUCHER] ❌ Error building combined PDF: {str(e)}", exc_info=True)
            raise

    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error generating combined PDF: {str(e)}", exc_info=True)
        raise


def generate_class_vouchers_zip(
    class_id: str,
    school_id: str,
    db = None
) -> bytes:
    """
    Generate a ZIP file containing individual PDF vouchers for all students in a class.

    Args:
        class_id: Class ID
        school_id: School ID for isolation
        db: Database connection (optional)

    Returns:
        ZIP file bytes containing individual PDFs
    """
    if db is None:
        db = get_db()

    try:
        logger.info(f"[FEE_VOUCHER] Generating ZIP for class: {class_id} in school: {school_id}")

        # Get all active students in the class
        students = list(db.students.find({
            "class_id": class_id,
            "school_id": school_id,
            "status": "active"
        }).sort("roll_number", 1))

        if not students:
            logger.warning(f"[FEE_VOUCHER] No students found in class {class_id}")
            raise ValueError("No students found in this class")

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()

        successful_count = 0
        failed_count = 0

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for student in students:
                try:
                    student_id = str(student["_id"])
                    student_name = student.get("full_name", "unknown").replace(" ", "_").replace("/", "_")
                    roll_number = student.get("roll_number", "N/A").replace("/", "_")

                    logger.info(f"[FEE_VOUCHER] Generating voucher for student: {student_name} ({student_id})")

                    # Generate individual PDF
                    pdf_bytes = generate_student_fee_voucher_with_photo(student_id, school_id, db)

                    if pdf_bytes and len(pdf_bytes) > 0:
                        # Add to ZIP
                        filename = f"{roll_number}_{student_name}.pdf"
                        zip_file.writestr(filename, pdf_bytes)
                        successful_count += 1
                        logger.info(f"[FEE_VOUCHER] ✅ Added voucher for {student_name} to ZIP ({len(pdf_bytes)} bytes)")
                    else:
                        logger.error(f"[FEE_VOUCHER] ❌ Empty PDF generated for student {student_id}")
                        failed_count += 1

                except Exception as e:
                    logger.error(f"[FEE_VOUCHER] ❌ Failed to generate voucher for student {student.get('full_name', 'unknown')}: {str(e)}", exc_info=True)
                    failed_count += 1
                    # Continue with other students
                    continue

        zip_buffer.seek(0)
        zip_size = len(zip_buffer.getvalue())
        logger.info(f"[FEE_VOUCHER] ✅ Successfully generated ZIP with {successful_count} vouchers ({failed_count} failed). ZIP size: {zip_size} bytes")

        if successful_count == 0:
            raise ValueError("No vouchers were successfully generated")

        return zip_buffer.getvalue()

    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error generating class vouchers ZIP: {str(e)}", exc_info=True)
        raise


def get_classes_with_fee_summary(school_id: str) -> List[Dict[str, Any]]:
    """Get all classes with fee collection summary"""
    db = get_db()

    # Get all classes
    classes = list(db.classes.find({"school_id": school_id}))

    result = []
    for cls in classes:
        class_id = str(cls["_id"])
        class_name = cls.get("class_name") or cls.get("name", class_id)

        # Count students
        student_count = db.students.count_documents({
            "class_id": class_id,
            "school_id": school_id,
            "status": "active"
        })

        # Calculate fee stats
        pipeline = [
            {"$match": {"class_id": class_id, "school_id": school_id}},
            {"$group": {
                "_id": None,
                "total_due": {"$sum": "$amount"},
                "total_paid": {"$sum": "$amount_paid"},
                "pending_count": {
                    "$sum": {"$cond": [{"$in": ["$status", ["pending", "unpaid"]]}, 1, 0]}
                }
            }}
        ]

        stats = list(db.fee_records.aggregate(pipeline))
        fee_stats = stats[0] if stats else {"total_due": 0, "total_paid": 0, "pending_count": 0}

        result.append({
            "id": class_id,
            "class_name": class_name,
            "section": cls.get("section", "A"),
            "student_count": student_count,
            "total_due": fee_stats.get("total_due", 0),
            "total_paid": fee_stats.get("total_paid", 0),
            "pending_count": fee_stats.get("pending_count", 0)
        })

    return result
