"""
Fee Voucher Service
Handles fee voucher generation and PDF export for students
"""
import io
import logging
import base64
import zipfile
from datetime import datetime
import calendar
from typing import List, Dict, Any, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from bson import ObjectId
from PIL import Image as PILImage

from app.database import get_db

logger = logging.getLogger(__name__)


class FeeVoucherService:
    """Service for generating fee vouchers"""
    
    def __init__(self, db=None):
        self.db = db or get_db()
    
    def get_school_info(self, school_id: str) -> Dict[str, Any]:
        """Get school information for voucher header"""
        try:
            # School IDs are strings in saas_root_db
            from app.services.saas_db import get_saas_db
            saas_db = get_saas_db()
            school = saas_db.schools.find_one({"school_id": school_id})
            
            if not school:
                # Fallback to regular schools collection
                school = self.db.schools.find_one({"school_id": school_id})
                
            if school:
                logger.info(f"[FEE_VOUCHER] Retrieved school info for: {school.get('school_name') or school.get('name', school_id)}")
                return {
                    "name": school.get("school_name") or school.get("display_name") or school.get("name", "School Management System"),
                    "address": school.get("address", ""),
                    "phone": school.get("phone", ""),
                    "email": school.get("email", ""),
                    "city": school.get("city", ""),
                    "postal_code": school.get("postal_code", "")
                }
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] Could not fetch school info: {str(e)}", exc_info=True)
        
        # Fallback if school not found
        return {
            "name": "School Management System",
            "address": "",
            "phone": "",
            "email": ""
        }
    
    def get_students_by_class(self, class_id: str, school_id: str) -> List[Dict[str, Any]]:
        """Get all students in a class with fee info"""
        students = list(self.db.students.find({
            "class_id": class_id,
            "school_id": school_id,
            "status": "active"
        }).sort("roll_number", 1))
        
        result = []
        for student in students:
            student_id = str(student["_id"])
            
            # Get pending/unpaid fees for this student
            fees = list(self.db.fee_records.find({
                "student_id": student_id,
                "status": {"$in": ["pending", "unpaid", "partial"]}
            }))
            
            # Calculate total due
            total_due = sum(fee.get("amount", 0) - fee.get("amount_paid", 0) for fee in fees)
            
            result.append({
                "id": student_id,
                "student_id": student.get("student_id"),
                "full_name": student.get("full_name"),
                "father_name": student.get("guardian_info", {}).get("father_name", ""),
                "roll_number": student.get("roll_number"),
                "class_id": class_id,
                "section": student.get("section", "A"),
                "total_due": total_due,
                "fees": fees
            })
        
        return result
    
    def get_fee_categories(self, school_id: str) -> List[Dict[str, Any]]:
        """Get fee categories for a school"""
        categories = list(self.db.fee_categories.find({"school_id": school_id}))
        return [
            {
                "id": str(cat["_id"]),
                "name": cat.get("name"),
                "amount": cat.get("amount", 0),
                "type": cat.get("type", "monthly")
            }
            for cat in categories
        ]
    
    def generate_voucher_pdf(
        self,
        student_data: Dict[str, Any],
        fee_details: List[Dict[str, Any]],
        school_info: Dict[str, Any],
        voucher_config: Dict[str, Any] = None
    ) -> bytes:
        """Generate PDF voucher for a student"""
        buffer = io.BytesIO()
        
        # Default config
        config = voucher_config or {}
        header_text = config.get("header_text", school_info.get("name", "School Management System"))
        footer_text = config.get("footer_text", "Thank you for your payment")
        due_date = config.get("due_date", datetime.now().strftime("%Y-%m-%d"))
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=16,
            alignment=TA_CENTER,
            spaceAfter=10
        )
        
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.gray
        )
        
        header_style = ParagraphStyle(
            'Header',
            parent=styles['Normal'],
            fontSize=9,
            alignment=TA_LEFT
        )
        
        elements = []
        
        # Header
        elements.append(Paragraph(header_text, title_style))
        elements.append(Paragraph("Fee Voucher", subtitle_style))
        elements.append(Spacer(1, 10*mm))
        
        # Voucher number and date
        voucher_no = f"VCH-{datetime.now().strftime('%Y%m%d')}-{student_data.get('roll_number', '000')}"
        info_data = [
            ["Voucher No:", voucher_no, "Date:", datetime.now().strftime("%d/%m/%Y")],
            ["Due Date:", due_date, "Status:", "PENDING"]
        ]
        
        info_table = Table(info_data, colWidths=[80, 150, 80, 150])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (3, 1), (3, 1), colors.red),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 8*mm))
        
        # Student info
        student_info = [
            ["Student Name:", student_data.get("full_name", "N/A")],
            ["Father's Name:", student_data.get("father_name", "N/A")],
            ["Roll Number:", student_data.get("roll_number", "N/A")],
            ["Class/Section:", f"{student_data.get('class_id', 'N/A')} / {student_data.get('section', 'A')}"],
        ]
        
        student_table = Table(student_info, colWidths=[100, 360])
        student_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.gray),
            ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ('BACKGROUND', (0, 0), (0, -1), colors.Color(0.95, 0.95, 0.95)),
        ]))
        elements.append(student_table)
        elements.append(Spacer(1, 8*mm))
        
        # Fee details table
        fee_header = ["Sr.", "Fee Category", "Amount (PKR)"]
        fee_rows = [fee_header]
        
        total = 0
        for idx, fee in enumerate(fee_details, 1):
            amount = fee.get("amount", 0)
            total += amount
            fee_rows.append([
                str(idx),
                fee.get("name", "Fee"),
                f"{amount:,.2f}"
            ])
        
        # Add total row
        fee_rows.append(["", "Total Amount", f"{total:,.2f}"])
        
        fee_table = Table(fee_rows, colWidths=[40, 320, 100])
        fee_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (1, -1), (2, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.2, 0.3, 0.4)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (0, -1), TA_CENTER),
            ('ALIGN', (2, 0), (2, -1), TA_RIGHT),
            ('BOX', (0, 0), (-1, -1), 1, colors.black),
            ('INNERGRID', (0, 0), (-1, -2), 0.5, colors.gray),
            ('LINEABOVE', (0, -1), (-1, -1), 1.5, colors.black),
            ('BACKGROUND', (0, -1), (-1, -1), colors.Color(0.9, 0.95, 0.9)),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(fee_table)
        elements.append(Spacer(1, 15*mm))
        
        # Payment instructions
        instructions = """
        <b>Payment Instructions:</b><br/>
        1. Pay at the school accounts office during office hours<br/>
        2. Online payment via bank transfer to school account<br/>
        3. Keep this voucher as receipt after payment<br/>
        """
        elements.append(Paragraph(instructions, styles['Normal']))
        elements.append(Spacer(1, 10*mm))
        
        # Footer
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            alignment=TA_CENTER,
            textColor=colors.gray
        )
        elements.append(Paragraph(footer_text, footer_style))
        elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()
    
    def generate_class_vouchers_pdf(
        self,
        students_data: List[Dict[str, Any]],
        school_info: Dict[str, Any],
        voucher_config: Dict[str, Any] = None
    ) -> bytes:
        """Generate combined PDF with vouchers for all students in a class"""
        buffer = io.BytesIO()
        
        # Default config
        config = voucher_config or {}
        header_text = config.get("header_text", school_info.get("name", "School Management System"))
        footer_text = config.get("footer_text", "Thank you for your payment")
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=10*mm,
            bottomMargin=10*mm
        )
        
        styles = getSampleStyleSheet()
        elements = []
        
        for idx, student in enumerate(students_data):
            if idx > 0:
                # Page break between students
                from reportlab.platypus import PageBreak
                elements.append(PageBreak())
            
            # Generate individual voucher content
            title_style = ParagraphStyle(
                'Title',
                parent=styles['Heading1'],
                fontSize=14,
                alignment=TA_CENTER,
                spaceAfter=5
            )
            
            elements.append(Paragraph(header_text, title_style))
            elements.append(Paragraph("Fee Voucher", ParagraphStyle(
                'Sub', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER
            )))
            elements.append(Spacer(1, 5*mm))
            
            # Student info compact
            student_info = f"""
            <b>Name:</b> {student.get('full_name', 'N/A')} | 
            <b>Father:</b> {student.get('father_name', 'N/A')} | 
            <b>Roll:</b> {student.get('roll_number', 'N/A')} |
            <b>Class:</b> {student.get('class_id', 'N/A')}
            """
            elements.append(Paragraph(student_info, styles['Normal']))
            elements.append(Spacer(1, 5*mm))
            
            # Fee table
            fee_rows = [["Fee Category", "Amount"]]
            total = student.get("total_due", 0)
            
            for fee in student.get("fees", []):
                fee_rows.append([
                    fee.get("category_name", "Fee"),
                    f"Rs. {fee.get('amount', 0):,.2f}"
                ])
            
            fee_rows.append(["TOTAL", f"Rs. {total:,.2f}"])
            
            fee_table = Table(fee_rows, colWidths=[350, 100])
            fee_table.setStyle(TableStyle([
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.2, 0.3, 0.4)),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (1, 0), (1, -1), TA_RIGHT),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.black),
                ('INNERGRID', (0, 0), (-1, -2), 0.25, colors.gray),
            ]))
            elements.append(fee_table)
            elements.append(Spacer(1, 3*mm))
            
            # Footer
            elements.append(Paragraph(footer_text, ParagraphStyle(
                'Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.gray
            )))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()


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
            from app.services.saas_db import get_saas_db
            saas_db = get_saas_db()
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
                    db
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


def _generate_single_voucher_elements(
    student: dict,
    school_info: dict,
    fee_components: list,
    class_id: str,
    styles,
    db
) -> list:
    """
    Helper function to generate 3-column voucher elements for a single student.
    Creates Bank Copy | Student Copy | Office Copy layout.
    Returns a list of reportlab elements.
    """
    from reportlab.lib.pagesizes import A4, landscape
    page_width, page_height = landscape(A4)

    # Compute usable width based on document margins used by combined PDF (15mm each)
    column_gap = 3 * mm
    doc_side_margin = 15 * mm
    usable_width = page_width - (doc_side_margin * 2) - (column_gap * 2)
    # Column width (3 columns with small gaps)
    col_width = usable_width / 3
    # Available width for inner content (accounting for column paddings)
    content_w = col_width - 10*mm
    # Inner content further reduced so inner tables' borders fit inside the outer column padding
    inner_content_w = content_w - 8*mm
    
    # Calculate total fee
    total_fee = sum(comp.get("amount", 0) for comp in fee_components)
    
    # Fetch school_id from student
    school_id = student.get("school_id", "")
    
    # Fetch voucher settings (header/footer) from database
    voucher_settings = None
    custom_header = ""
    custom_footer = ""
    try:
        voucher_settings = db.fee_voucher_settings.find_one({"school_id": school_id})
        if voucher_settings:
            custom_header = voucher_settings.get("header_text", "") or ""
            custom_footer = voucher_settings.get("footer_text", "") or ""
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
    photo_data = None
    if student.get("profile_image_blob"):
        try:
            image_data = base64.b64decode(student["profile_image_blob"])
            image_buffer = io.BytesIO(image_data)
            photo_data = PILImage.open(image_buffer)
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] ⚠️ Could not load student photo: {str(e)}")
    
    def create_voucher_copy(copy_title: str) -> Table:
        """Create a single voucher copy for one column"""
        copy_elements = []
        
        # Copy header (Bank Copy / Student Copy / Office Copy)
        header_style = ParagraphStyle(
            'CopyHeader',
            parent=styles['Normal'],
            fontSize=8,
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
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        copy_elements.append(copy_header)
        
        # FEE VOUCHER centered title
        title_style = ParagraphStyle(
            'VoucherTitle',
            parent=styles['Heading2'],
            fontSize=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#2c5282'),
            spaceAfter=2*mm,
            spaceBefore=2*mm
        )
        copy_elements.append(Paragraph("<b>FEE VOUCHER</b>", title_style))
        
        # Student photo (if available) - small at top right
        photo_element = None
        if photo_data:
            try:
                img_buffer = io.BytesIO()
                photo_data.save(img_buffer, format='PNG')
                img_buffer.seek(0)
                photo_element = Image(img_buffer, width=15*mm, height=18*mm)
            except:
                pass
        
        # Student info section
        info_style = ParagraphStyle('Info', parent=styles['Normal'], fontSize=7, leading=9)
        bold_style = ParagraphStyle('BoldInfo', parent=styles['Normal'], fontSize=7, leading=9, fontName='Helvetica-Bold')
        
        student_info_rows = [
            [Paragraph("<b>Name:</b>", bold_style), Paragraph(student.get("full_name", "N/A"), info_style)],
            [Paragraph("<b>S/D of:</b>", bold_style), Paragraph((student.get("guardian_info") or {}).get("father_name") or "N/A", info_style)],
            [Paragraph("<b>Class:</b>", bold_style), Paragraph(class_name, info_style)],
            [Paragraph("<b>Roll #:</b>", bold_style), Paragraph(str(student.get("roll_number", "N/A")), info_style)],
        ]
        
        info_table = Table(student_info_rows, colWidths=[18*mm, inner_content_w - 22*mm])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        # Combine info with photo
        photo_w = 18*mm
        if photo_element:
            info_photo_row = [[info_table, photo_element]]
            info_photo_table = Table(info_photo_row, colWidths=[inner_content_w - photo_w, photo_w])
        else:
            info_photo_row = [[info_table]]
            info_photo_table = Table(info_photo_row, colWidths=[inner_content_w])
        
        info_photo_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        copy_elements.append(info_photo_table)
        copy_elements.append(Spacer(1, 3*mm))
        
        # Custom header (if provided)
        if custom_header:
            header_custom_style = ParagraphStyle('CustomHeader', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#333333'), fontName='Helvetica-Bold')
            copy_elements.append(Paragraph(custom_header, header_custom_style))
            copy_elements.append(Spacer(1, 2*mm))
        
        # Fee details header
        fee_header_style = ParagraphStyle('FeeHeader', parent=styles['Normal'], fontSize=7, fontName='Helvetica-Bold', textColor=colors.white)
        fee_item_style = ParagraphStyle('FeeItem', parent=styles['Normal'], fontSize=7)
        fee_amount_style = ParagraphStyle('FeeAmount', parent=styles['Normal'], fontSize=7, alignment=TA_RIGHT)
        
        # Fee table rows
        fee_rows = [
            [Paragraph("<b>Description</b>", fee_header_style), Paragraph("<b>Amount</b>", fee_header_style)]
        ]
        
        # Only add fee components (no zero discount/tax/arrears)
        if fee_components:
            for comp in fee_components:
                comp_name = comp.get('component_name', comp.get('name', 'Fee'))
                comp_amount = comp.get('amount', 0)
                fee_rows.append([
                    Paragraph(comp_name, fee_item_style),
                    Paragraph(f"Rs. {comp_amount:,.0f}", fee_amount_style)
                ])
        else:
            fee_rows.append([
                Paragraph("No fee assigned", fee_item_style),
                Paragraph("Rs. 0", fee_amount_style)
            ])
        
        # Total row
        total_style = ParagraphStyle('Total', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold')
        total_amount_style = ParagraphStyle('TotalAmount', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', alignment=TA_RIGHT)
        fee_rows.append([
            Paragraph("<b>TOTAL</b>", total_style),
            Paragraph(f"<b>Rs. {total_fee:,.0f}</b>", total_amount_style)
        ])
        
        fee_table = Table(fee_rows, colWidths=[inner_content_w * 0.65, inner_content_w * 0.35])

        # Style for fee table
        table_style = [
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.black),
            ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.grey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e6f2ff')),
        ]
        fee_table.setStyle(TableStyle(table_style))
        copy_elements.append(fee_table)
        copy_elements.append(Spacer(1, 4*mm))
        
        # Issue/Due date row
        date_style = ParagraphStyle('DateInfo', parent=styles['Normal'], fontSize=6)
        date_row = Table([
            [Paragraph(f"<b>Issue:</b> {issue_dt.strftime('%d/%m/%Y')}", date_style),
             Paragraph(f"<b>Due:</b> {due_date_obj.strftime('%d/%m/%Y')}", date_style)]
        ], colWidths=[inner_content_w / 2, inner_content_w / 2])
        date_row.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 6),
        ]))
        copy_elements.append(date_row)
        copy_elements.append(Spacer(1, 3*mm))
        
        # Custom footer (if provided)
        if custom_footer:
            footer_custom_style = ParagraphStyle('CustomFooter', parent=styles['Normal'], fontSize=7, alignment=TA_CENTER, textColor=colors.HexColor('#444444'), fontName='Helvetica-Oblique', leading=9)
            copy_elements.append(Paragraph(custom_footer, footer_custom_style))
            copy_elements.append(Spacer(1, 3*mm))
        
        # Two separate stamp areas: Accountant and Bank
        stamp_style = ParagraphStyle('Stamp', parent=styles['Normal'], fontSize=6, alignment=TA_CENTER)
        stamp_rows = [
            [Paragraph("<b>Accountant Signature</b>", stamp_style)],
            [Paragraph("<b>Bank Stamp</b>", stamp_style)]
        ]
        stamp_box = Table(stamp_rows, colWidths=[inner_content_w])
        stamp_box.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        copy_elements.append(stamp_box)
        
        # Combine all elements into a single column table
        column_table = Table([[elem] for elem in copy_elements], colWidths=[content_w])
        column_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#1a365d')),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        
        return column_table
    
    # Create 3 copies
    bank_copy = create_voucher_copy("BANK COPY")
    student_copy = create_voucher_copy("STUDENT COPY")
    office_copy = create_voucher_copy("OFFICE COPY")
    
    # Main layout: 3 columns side by side
    main_table = Table(
        [[bank_copy, student_copy, office_copy]],
        colWidths=[col_width, col_width, col_width]
    )
    main_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 1*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 1*mm),
    ]))
    
    return [main_table]


def generate_student_fee_voucher_with_photo(
    student_id: str,
    school_id: str,
    db = None
) -> bytes:
    """
    Generate a landscape A4 fee voucher PDF with 3 copies side-by-side:
    Bank Copy | Student Copy | Office Copy
    
    Args:
        student_id: Student's ID
        school_id: School ID for isolation
        db: Database connection (optional)
    
    Returns:
        PDF bytes
    """
    if db is None:
        db = get_db()
    
    try:
        logger.info(f"[FEE_VOUCHER] Generating voucher for student: {student_id} in school: {school_id}")
        
        # Fetch student data
        student = db.students.find_one({
            "_id": ObjectId(student_id),
            "school_id": school_id
        })
        
        if not student:
            logger.error(f"[FEE_VOUCHER] ❌ Student {student_id} not found")
            raise ValueError("Student not found")
        
        # Fetch fee category for the student's class
        class_id = student.get("class_id")
        fee_components = []
        class_name = "N/A"
        
        # Look up class document to get proper class name
        if class_id:
            try:
                class_doc = db.classes.find_one({"_id": ObjectId(class_id)})
                if class_doc:
                    class_name = class_doc.get("class_name", class_doc.get("name", "N/A"))
                    section = class_doc.get("section", "")
                    if section:
                        class_name = f"{class_name} - {section}"
                else:
                    # Try by string ID
                    class_doc = db.classes.find_one({"class_id": class_id})
                    if class_doc:
                        class_name = class_doc.get("class_name", class_doc.get("name", "N/A"))
                        section = class_doc.get("section", "")
                        if section:
                            class_name = f"{class_name} - {section}"
            except Exception as e:
                logger.warning(f"[FEE_VOUCHER] Could not lookup class: {e}")
                class_name = str(class_id) if class_id else "N/A"
            
            # Get fee assignment for this class
            fee_assignment = db.class_fee_assignments.find_one({
                "school_id": school_id,
                "class_id": class_id
            })
            
            if fee_assignment:
                category_id = fee_assignment.get("category_id")
                fee_category = db.fee_categories.find_one({"_id": ObjectId(category_id)})
                
                if fee_category:
                    fee_components = fee_category.get("components", [])
                    logger.info(f"[FEE_VOUCHER] Found fee category: {fee_category.get('name')} with {len(fee_components)} components")
        
        # Calculate total fee
        total_fee = sum(comp.get("amount", 0) for comp in fee_components)
        
        # Prepare student photo if available
        photo_data = None
        if student.get("profile_image_blob"):
            try:
                image_data = base64.b64decode(student["profile_image_blob"])
                image_buffer = io.BytesIO(image_data)
                pil_image = PILImage.open(image_buffer)
                photo_data = pil_image
                logger.info(f"[FEE_VOUCHER] ✅ Student photo loaded successfully")
            except Exception as e:
                logger.warning(f"[FEE_VOUCHER] ⚠️ Could not load student photo: {str(e)}")
        
        # Generate PDF with 3 columns
        buffer = io.BytesIO()
        
        # Fetch voucher settings (header/footer) from database
        voucher_settings = None
        try:
            voucher_settings = db.fee_voucher_settings.find_one({"school_id": school_id})
        except Exception as e:
            logger.warning(f"[FEE_VOUCHER] Could not fetch voucher settings: {e}")
        
        custom_header = (voucher_settings.get("header_text", "") if voucher_settings else "") or ""
        custom_footer = (voucher_settings.get("footer_text", "") if voucher_settings else "") or ""
        due_day = (voucher_settings.get("due_day") if voucher_settings and "due_day" in voucher_settings else None)

        # Compute issue and due dates. If `due_day` is provided (1-31), compute the next occurrence
        issue_dt = datetime.now()
        due_date_obj = issue_dt.date()
        try:
            if due_day:
                dd = int(due_day)
                year = issue_dt.year
                month = issue_dt.month
                last_day = calendar.monthrange(year, month)[1]
                day = min(max(1, dd), last_day)
                candidate = datetime(year, month, day)
                if candidate.date() < issue_dt.date():
                    # move to next month
                    nm = month + 1
                    ny = year + (nm - 1) // 12
                    nm = ((nm - 1) % 12) + 1
                    last_day2 = calendar.monthrange(ny, nm)[1]
                    day2 = min(max(1, dd), last_day2)
                    candidate = datetime(ny, nm, day2)
                due_date_obj = candidate.date()
        except Exception:
            due_date_obj = issue_dt.date()
        
        # A4 landscape dimensions
        page_width, page_height = landscape(A4)
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            rightMargin=5*mm,
            leftMargin=5*mm,
            topMargin=5*mm,
            bottomMargin=5*mm
        )
        
        styles = getSampleStyleSheet()
        
        # Compute usable width based on document margins set on this doc
        column_gap = 3 * mm
        usable_width = page_width - (doc.leftMargin + doc.rightMargin) - (column_gap * 2)
        # Column width (3 columns with small gaps)
        col_width = usable_width / 3  # wider per-column space
        # Available width for inner content (accounting for column paddings)
        content_w = col_width - 10*mm
        # Inner content further reduced so inner tables' borders fit inside the outer column padding
        inner_content_w = content_w - 8*mm
        
        def create_voucher_copy(copy_title: str) -> Table:
            """Create a single voucher copy for one column"""
            copy_elements = []
            
            # Copy header (Bank Copy / Student Copy / Office Copy)
            header_style = ParagraphStyle(
                'CopyHeader',
                parent=styles['Normal'],
                fontSize=8,
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
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            copy_elements.append(copy_header)
            
            # FEE VOUCHER centered title
            title_style = ParagraphStyle(
                'VoucherTitle',
                parent=styles['Heading2'],
                fontSize=11,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#2c5282'),
                spaceAfter=2*mm,
                spaceBefore=2*mm
            )
            copy_elements.append(Paragraph("<b>FEE VOUCHER</b>", title_style))
            
            # Student photo (if available) - small at top right
            photo_element = None
            if photo_data:
                try:
                    img_buffer = io.BytesIO()
                    photo_data.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    photo_element = Image(img_buffer, width=15*mm, height=18*mm)
                except:
                    pass
            
            # Student info section
            info_style = ParagraphStyle('Info', parent=styles['Normal'], fontSize=7, leading=9)
            bold_style = ParagraphStyle('BoldInfo', parent=styles['Normal'], fontSize=7, leading=9, fontName='Helvetica-Bold')
            
            student_info_rows = [
                [Paragraph("<b>Name:</b>", bold_style), Paragraph(student.get("full_name", "N/A"), info_style)],
                [Paragraph("<b>S/D of:</b>", bold_style), Paragraph((student.get("guardian_info") or {}).get("father_name") or "N/A", info_style)],
                [Paragraph("<b>Class:</b>", bold_style), Paragraph(class_name, info_style)],
                [Paragraph("<b>Roll #:</b>", bold_style), Paragraph(str(student.get("roll_number", "N/A")), info_style)],
            ]
            
            info_table = Table(student_info_rows, colWidths=[18*mm, inner_content_w - 22*mm])
            info_table.setStyle(TableStyle([
                ('FONTSIZE', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            
            # Combine info with photo
            photo_w = 18*mm
            if photo_element:
                info_photo_row = [[info_table, photo_element]]
                info_photo_table = Table(info_photo_row, colWidths=[inner_content_w - photo_w, photo_w])
            else:
                info_photo_row = [[info_table]]
                info_photo_table = Table(info_photo_row, colWidths=[inner_content_w])
            
            info_photo_table.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 2),
                ('RIGHTPADDING', (0, 0), (-1, -1), 2),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            copy_elements.append(info_photo_table)
            copy_elements.append(Spacer(1, 4*mm))
            
            # Custom header (if provided)
            if custom_header:
                header_custom_style = ParagraphStyle('CustomHeader', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#333333'), fontName='Helvetica-Bold')
                copy_elements.append(Paragraph(custom_header, header_custom_style))
                copy_elements.append(Spacer(1, 3*mm))
            
            # Fee details header
            fee_header_style = ParagraphStyle('FeeHeader', parent=styles['Normal'], fontSize=7, fontName='Helvetica-Bold', textColor=colors.white)
            fee_item_style = ParagraphStyle('FeeItem', parent=styles['Normal'], fontSize=7)
            fee_amount_style = ParagraphStyle('FeeAmount', parent=styles['Normal'], fontSize=7, alignment=TA_RIGHT)
            
            # Fee table rows
            fee_rows = [
                [Paragraph("<b>Description</b>", fee_header_style), Paragraph("<b>Amount</b>", fee_header_style)]
            ]
            
            # Only add fee components (no zero discount/tax/arrears)
            if fee_components:
                for comp in fee_components:
                    comp_name = comp.get('component_name', comp.get('name', 'Fee'))
                    comp_amount = comp.get('amount', 0)
                    fee_rows.append([
                        Paragraph(comp_name, fee_item_style),
                        Paragraph(f"Rs. {comp_amount:,.0f}", fee_amount_style)
                    ])
            else:
                fee_rows.append([
                    Paragraph("No fee assigned", fee_item_style),
                    Paragraph("Rs. 0", fee_amount_style)
                ])
            
            # Total row
            total_style = ParagraphStyle('Total', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold')
            total_amount_style = ParagraphStyle('TotalAmount', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', alignment=TA_RIGHT)
            fee_rows.append([
                Paragraph("<b>TOTAL</b>", total_style),
                Paragraph(f"<b>Rs. {total_fee:,.0f}</b>", total_amount_style)
            ])
            
            fee_table = Table(fee_rows, colWidths=[inner_content_w * 0.65, inner_content_w * 0.35])
            
            # Style for fee table
            table_style = [
                ('FONTSIZE', (0, 0), (-1, -1), 7),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.black),
                ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.grey),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e6f2ff')),
            ]
            fee_table.setStyle(TableStyle(table_style))
            copy_elements.append(fee_table)
            copy_elements.append(Spacer(1, 4*mm))
            
            # Issue/Due date row
            date_style = ParagraphStyle('DateInfo', parent=styles['Normal'], fontSize=6)
            date_row = Table([
                [Paragraph(f"<b>Issue:</b> {issue_dt.strftime('%d/%m/%Y')}", date_style),
                 Paragraph(f"<b>Due:</b> {due_date_obj.strftime('%d/%m/%Y')}", date_style)]
            ], colWidths=[inner_content_w / 2, inner_content_w / 2])
            date_row.setStyle(TableStyle([
                ('FONTSIZE', (0, 0), (-1, -1), 6),
            ]))
            copy_elements.append(date_row)
            copy_elements.append(Spacer(1, 3*mm))
            
            # Custom footer (if provided)
            if custom_footer:
                footer_custom_style = ParagraphStyle('CustomFooter', parent=styles['Normal'], fontSize=7, alignment=TA_CENTER, textColor=colors.HexColor('#444444'), fontName='Helvetica-Oblique', leading=9)
                copy_elements.append(Paragraph(custom_footer, footer_custom_style))
                copy_elements.append(Spacer(1, 3*mm))
            
            # Two separate stamp areas: Accountant and Bank
            stamp_style = ParagraphStyle('Stamp', parent=styles['Normal'], fontSize=6, alignment=TA_CENTER)
            stamp_rows = [
                [Paragraph("<b>Accountant Signature</b>", stamp_style)],
                [Paragraph("<b>Bank Stamp</b>", stamp_style)]
            ]
            stamp_box = Table(stamp_rows, colWidths=[inner_content_w])
            stamp_box.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ]))
            copy_elements.append(stamp_box)
            
            # Combine all elements into a single column table
            column_table = Table([[elem] for elem in copy_elements], colWidths=[content_w])
            column_table.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#1a365d')),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            
            return column_table
        
        # Create 3 copies
        bank_copy = create_voucher_copy("BANK COPY")
        student_copy = create_voucher_copy("STUDENT COPY")
        office_copy = create_voucher_copy("OFFICE COPY")
        
        # Main layout: 3 columns side by side
        main_table = Table(
            [[bank_copy, student_copy, office_copy]],
            colWidths=[col_width, col_width, col_width]
        )
        main_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 1*mm),
            ('RIGHTPADDING', (0, 0), (-1, -1), 1*mm),
        ]))
        
        elements = [main_table]
        
        # Build PDF
        try:
            doc.build(elements)
            buffer.seek(0)
            pdf_bytes = buffer.getvalue()
            
            # Validate PDF
            if not pdf_bytes or len(pdf_bytes) < 100:
                raise ValueError(f"Generated PDF is too small ({len(pdf_bytes)} bytes)")
            
            if not pdf_bytes.startswith(b'%PDF'):
                raise ValueError("Generated file is not a valid PDF")
            
            logger.info(f"[FEE_VOUCHER] ✅ Successfully generated voucher PDF for student: {student.get('full_name')} ({len(pdf_bytes)} bytes)")
            return pdf_bytes
        except Exception as e:
            logger.error(f"[FEE_VOUCHER] ❌ Error building PDF: {str(e)}", exc_info=True)
            raise
        
    except Exception as e:
        logger.error(f"[FEE_VOUCHER] ❌ Error generating voucher: {str(e)}", exc_info=True)
        raise

