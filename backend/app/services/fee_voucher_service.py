"""
Fee Voucher Service
Handles fee voucher generation and PDF export for students
"""
import io
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from bson import ObjectId

from app.database import get_db

logger = logging.getLogger(__name__)


class FeeVoucherService:
    """Service for generating fee vouchers"""
    
    def __init__(self, db=None):
        self.db = db or get_db()
    
    def get_school_info(self, school_id: str) -> Dict[str, Any]:
        """Get school information for voucher header"""
        # Try to get from school settings or classes
        school_info = {
            "name": "School Management System",
            "address": "",
            "phone": "",
            "email": ""
        }
        
        # Try to get from first class or student with school info
        sample = self.db.students.find_one({"school_id": school_id})
        if sample:
            school_info["name"] = f"School ID: {school_id}"
        
        return school_info
    
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
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
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
