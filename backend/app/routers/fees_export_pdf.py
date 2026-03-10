"""
PDF Export endpoint for fees - replaces Excel export in fees.py

This module contains the fixed export_fees_by_status endpoint that:
1. Properly fetches fee category amounts
2. Includes father name and phone number
3. Generates PDF instead of Excel
4. Uses A4 landscape format with proper table layout
"""

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
import logging
from io import BytesIO
from app.dependencies.auth import check_permission
from app.database import get_db
from bson import ObjectId
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from datetime import datetime
import time

logger = logging.getLogger(__name__)


async def export_fees_by_status_pdf(
    class_id: str,
    status: str,
    section: str = None,
    current_user: dict = None
):
    """Export fee report by status (paid/partial/unpaid) as PDF for a class, optionally filtered by section"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    print(f"\n{'='*80}")
    print(f"[EXPORT_PDF] START | class_id={class_id} section={section} status={status}")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] [EXPORT_PDF] Exporting {status.upper()} for class {class_id} section {section}")
    logger.debug(f"[EXPORT_PDF] User: {admin_email}, School: {school_id}, Class: {class_id}, Section: {section}, Status: {status}")
    
    try:
        db = get_db()
        start_ts = time.time()

        # Fetch class info
        try:
            class_doc = db.classes.find_one({"_id": ObjectId(class_id), "school_id": school_id})
        except Exception:
            class_doc = db.classes.find_one({"_id": class_id, "school_id": school_id})
        if not class_doc:
            logger.error(f"[EXPORT_PDF] ❌ Class {class_id} not found for school {school_id}")
            raise HTTPException(status_code=404, detail="Class not found")
        
        class_name = class_doc.get("class_name", "Unknown")
        logger.info(f"[EXPORT_PDF] Class: {class_name}")
        
        # Fetch active fee category via class_fee_assignments - FIXED LOGIC
        total_fee_amount = 0
        fee_category_name = "N/A"
        print(f"[EXPORT_PDF] Looking up fee assignment for class_id={class_id}, school_id={school_id}")
        
        assignment = db.class_fee_assignments.find_one({
            "class_id": class_id,
            "school_id": school_id,
            "is_active": True
        })
        
        if assignment and assignment.get("category_id"):
            category_id = assignment.get("category_id")
            print(f"[EXPORT_PDF] Found assignment with category_id: {category_id}")
            logger.debug(f"[EXPORT_PDF] Assignment doc: {assignment}")
            
            try:
                cat_obj_id = ObjectId(category_id) if isinstance(category_id, str) else category_id
            except:
                cat_obj_id = category_id
            
            cat = db.fee_categories.find_one({"_id": cat_obj_id, "school_id": school_id})
            
            if cat:
                fee_category_name = cat.get("name", "Unknown")
                print(f"[EXPORT_PDF] Found category: {fee_category_name}")
                
                # Calculate total from components
                if isinstance(cat.get("components"), list) and len(cat.get("components", [])) > 0:
                    components = cat.get("components", [])
                    total_fee_amount = sum(float(comp.get("amount", 0)) for comp in components)
                    print(f"[EXPORT_PDF] ✅ Calculated from {len(components)} components: PKR {total_fee_amount}")
                # Fallback to total_amount field
                elif "total_amount" in cat and isinstance(cat.get("total_amount"), (int, float)):
                    total_fee_amount = float(cat.get("total_amount", 0))
                    print(f"[EXPORT_PDF] ✅ Using total_amount: PKR {total_fee_amount}")
                else:
                    print(f"[EXPORT_PDF] ⚠️ No components or total_amount in category")
                
                logger.info(f"[EXPORT_PDF] Fee category: {fee_category_name} = PKR {total_fee_amount}")
            else:
                print(f"[EXPORT_PDF] ❌ Category not found for ID {category_id}")
                logger.warning(f"[EXPORT_PDF] Category not found for ID {category_id}")
        else:
            print(f"[EXPORT_PDF] ❌ No active fee assignment for this class")
            logger.warning(f"[EXPORT_PDF] No active fee assignment for class {class_id}")
        
        # CRITICAL FIX: If no fee amount found, raise error instead of continuing with 0
        if total_fee_amount == 0:
            print(f"[EXPORT_PDF] ❌ CRITICAL ERROR: No fee category assigned or fee amount is 0")
            logger.error(f"[EXPORT_PDF] ❌ No fee category assigned to class {class_name} or fee amount is 0. Cannot export PDF.")
            raise HTTPException(
                status_code=400, 
                detail=f"No fee category assigned to class {class_name} or fee amount is 0. Please assign a fee category first."
            )
        
        # Fetch all students in this class with guardian info - FIXED QUERY
        student_query = {"school_id": school_id, "class_id": class_id}
        if section:
            student_query["section"] = section
            print(f"[EXPORT_PDF] Querying students with section filter: {section}")
        
        students = list(db.students.find(
            student_query,
            {
                "full_name": 1, "roll_number": 1, "registration_number": 1, "student_id": 1, 
                "section": 1, "scholarship_percent": 1, "scholarship": 1, 
                "arrears_balance": 1, "arrears": 1,
                "guardian_info.father_name": 1, "guardian_info.guardian_contact": 1
            }
        ))
        print(f"[EXPORT_PDF] Found {len(students)} students")
        logger.info(f"[EXPORT_PDF] Found {len(students)} students in {round((time.time()-start_ts), 2)}s")
        logger.debug(f"[EXPORT_PDF] Student query: {student_query}")

        if not students:
            print(f"[EXPORT_PDF] ⚠️ No students found in this class/section")
            logger.info(f"[EXPORT_PDF] Empty class/section → empty report")
            raise HTTPException(status_code=404, detail=f"No students found in {class_name} {section or ''}")

        # Build payment search candidates
        payment_search_ids = set()
        for s in students:
            payment_search_ids.add(str(s["_id"]))
            if s.get("student_id"):
                payment_search_ids.add(s.get("student_id"))
            if s.get("registration_number"):
                payment_search_ids.add(s.get("registration_number"))
        
        payment_search_ids = list(payment_search_ids)
        print(f"[EXPORT_PDF] Payment search IDs: {len(payment_search_ids)} candidates")
        logger.debug(f"[EXPORT_PDF] Payment search IDs: {payment_search_ids}")
        
        # Bulk fetch payments for matching students
        fee_summaries = {}
        if payment_search_ids:
            try:
                payments = list(db.fee_payments.aggregate([
                    {"$match": {"student_id": {"$in": payment_search_ids}, "school_id": school_id}},
                    {"$group": {
                        "_id": "$student_id",
                        "total_paid": {"$sum": "$amount_paid"}
                    }}
                ]))
                print(f"[EXPORT_PDF] Found {len(payments)} payment records")
                for p in payments:
                    fee_summaries[p["_id"]] = p.get("total_paid", 0)
                logger.info(f"[EXPORT_PDF] Matched payments for {len(fee_summaries)} students")
            except Exception as e:
                print(f"[EXPORT_PDF] ❌ Payment aggregation failed: {str(e)}")
                logger.warning(f"[EXPORT_PDF] Payment aggregation failed: {str(e)}")
        
        # Calculate status for each student and build rows
        rows = []
        status_counts = {"paid": 0, "partial": 0, "unpaid": 0}
        print(f"[EXPORT_PDF] Processing {len(students)} students with fee amount: PKR {total_fee_amount}")
        
        logger.info(f"[EXPORT_PDF] Processing {len(students)} students with fee amount: PKR {total_fee_amount}")
        for idx, student in enumerate(students):
            sid = str(student["_id"])
            paid_amount = fee_summaries.get(sid, 0)
            arrears = student.get("arrears_balance") or student.get("arrears") or 0
            scholarship_percent = student.get("scholarship_percent") or student.get("scholarship") or 0
            scholarship_amount = round((total_fee_amount * scholarship_percent) / 100)
            remaining = total_fee_amount - paid_amount + arrears - scholarship_amount
            
            # Determine fee status based on remaining balance
            if remaining <= 0:
                fee_status = "paid"
            elif paid_amount > 0:
                fee_status = "partial"
            else:
                fee_status = "unpaid"
            
            status_counts[fee_status] += 1
            
            # Only include if status matches requested export type
            if status.lower() != fee_status:
                continue
            
            # Extract guardian info
            guardian_info = student.get("guardian_info", {}) or {}
            father_name = guardian_info.get("father_name", "") or ""
            guardian_contact = guardian_info.get("guardian_contact", "") or ""
            
            rows.append({
                "name": student.get("full_name", ""),
                "roll_number": student.get("roll_number", ""),
                "registration_id": student.get("registration_number") or student.get("student_id", ""),
                "father_name": father_name,
                "father_phone": guardian_contact,
                "section": student.get("section", ""),
                "total_fee": total_fee_amount,
                "paid_amount": paid_amount,
                "remaining_amount": max(0, remaining),
                "arrears": arrears,
                "scholarship_percent": scholarship_percent,
                "scholarship_amount": scholarship_amount,
                "status": fee_status.capitalize()
            })
        
        print(f"[EXPORT_PDF] ═══════════════════════════════════════════════════════════════════")
        print(f"[EXPORT_PDF] Status breakdown: paid={status_counts['paid']} partial={status_counts['partial']} unpaid={status_counts['unpaid']}")
        print(f"[EXPORT_PDF] Filtered rows for {status.upper()}: {len(rows)} records")
        logger.info(f"[EXPORT_PDF] Totals: paid={status_counts['paid']} partial={status_counts['partial']} unpaid={status_counts['unpaid']} | Selected {len(rows)} {status}")
        
        if not rows:
            # No matching rows for requested status — return 404 with clear message.
            raise HTTPException(status_code=404, detail=f"No {status} students found in {class_name} {section or ''}")
        
        # Generate PDF with A4 landscape orientation
        bio = BytesIO()
        doc = SimpleDocTemplate(
            bio,
            pagesize=landscape(A4),
            rightMargin=30,
            leftMargin=30,
            topMargin=40,
            bottomMargin=30
        )
        
        elements = []
        styles = getSampleStyleSheet()

        # Table cell paragraph style for consistent font and sizing
        table_cell_style = ParagraphStyle(
            name='TableCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=9
        )
        table_header_style = ParagraphStyle(
            name='TableHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=9,
            alignment=1
        )
        
        # Title
        title_text = f"Fee Report - {status.capitalize()} Students"
        subtitle_text = f"Class: {class_name} {section or ''} | Fee Category: {fee_category_name} | Date: {datetime.now().strftime('%Y-%m-%d')}"
        
        title = Paragraph(f"<b>{title_text}</b>", styles['Title'])
        subtitle = Paragraph(subtitle_text, styles['Normal'])
        elements.append(title)
        elements.append(subtitle)
        elements.append(Spacer(1, 0.3*inch))
        
        # Table data with selected columns (Paid removed; Scholarship combined)
        table_data = [[
            "Name", "Roll No", "Reg ID", "Father Name", "Phone",
            "Total Fee", "Remaining", "Arrears", "Scholarship", "Status"
        ]]
        
        for row in rows:
            # Use Paragraphs for text fields to allow wrapping; apply uniform table_cell_style
            table_data.append([
                Paragraph(row["name"], table_cell_style),
                str(row["roll_number"]),
                str(row["registration_id"]),
                Paragraph(row["father_name"], table_cell_style) if row["father_name"] else "",
                Paragraph(str(row["father_phone"]), table_cell_style) if row["father_phone"] else "",
                f"{row['total_fee']:,.0f}",
                f"{row['remaining_amount']:,.0f}",
                f"{row['arrears']:,.0f}",
                f"{row['scholarship_percent']:.1f}%: {row['scholarship_amount']:,.0f}",
                row["status"]
            ])
        
        # Create table with responsive column widths based on available page width
        usable_width = doc.width  # accounts for left/right margins

        # Relative column ratios (sum does not have to be 1.0; we'll normalize)
        # Columns: Name, Roll, RegID, Father, Phone, Total, Remaining, Arrears, Scholarship, Status
        col_ratios = [0.18, 0.06, 0.12, 0.18, 0.11, 0.07, 0.07, 0.06, 0.06, 0.09]
        total_ratio = sum(col_ratios)
        col_widths = [(r / total_ratio) * usable_width for r in col_ratios]

        table = Table(table_data, colWidths=col_widths, repeatRows=1)

        # Table styling - reduced font sizes and slightly larger cell padding
        table.setStyle(TableStyle([
            # Header styling
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('TOPPADDING', (0, 0), (-1, 0), 6),

            # Data rows styling
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
            ('ALIGN', (5, 1), (8, -1), 'RIGHT'),  # Right-align numeric columns (Total, Remaining, Arrears, Scholarship)
            ('ALIGN', (9, 1), (9, -1), 'CENTER'),  # Status center
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),

            # Grid
            ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

            # Alternating row colors
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F4F6')])
        ]))
        
        elements.append(table)
        
        # Summary footer
        elements.append(Spacer(1, 0.2*inch))
        summary_text = f"Total {status.capitalize()} Students: {len(rows)} | Generated by: {admin_email} | {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        summary = Paragraph(summary_text, styles['Normal'])
        elements.append(summary)
        
        # Build PDF
        doc.build(elements)
        bio.seek(0)
        
        filename = f"fee_report_{class_name.replace(' ', '_')}_{section or 'all'}_{status}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        elapsed = round((time.time()-start_ts), 2)
        print(f"[EXPORT_PDF] ✅ Generated PDF with {len(rows)} rows | {elapsed}s")
        print(f"[EXPORT_PDF] Filename: {filename}")
        print(f"{'='*80}\n")
        logger.info(f"[EXPORT_PDF] ✅ PDF {len(rows)} rows | {elapsed}s")
        
        return StreamingResponse(
            bio,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[EXPORT_PDF] ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"[EXPORT_PDF] ❌ {str(e)}")
        print(f"{'='*80}\n")
        raise HTTPException(status_code=500, detail=str(e))
