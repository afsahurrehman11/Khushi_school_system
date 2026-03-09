from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
import logging
from io import BytesIO
from app.models.fee import FeeCreate, FeeInDB, FeeUpdate, FeeGenerate
from app.services.fee import (
    get_all_fees, get_fee_by_id, create_fee, update_fee, delete_fee, get_fees_by_student
)
from app.services.student import get_all_students
from app.dependencies.auth import check_permission
from app.database import get_db
from typing import Dict
from bson import ObjectId
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

logger = logging.getLogger(__name__)

def convert_objectids(obj):
    """Recursively convert ObjectId to string in dict/list"""
    if isinstance(obj, dict):
        return {k: convert_objectids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

router = APIRouter()

@router.get("/fees")
async def get_fees(
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fees with optional filters and pagination. Returns {count, page, page_size, fees}"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching fees")
    
    try:
        db = get_db()
        query = {"school_id": school_id} if school_id else {}
        if student_id:
            query["student_id"] = student_id
        if status:
            query["status"] = status

        # sanitize paging
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 500:
            page_size = 20

        total = db.fees.count_documents(query)
        sd = -1 if sort_dir.lower() == "desc" else 1
        cursor = db.fees.find(query).sort(sort_by, sd).skip((page - 1) * page_size).limit(page_size)
        fees = list(cursor)
        fees = [convert_objectids(fee) for fee in fees]
        for f in fees:
            f["id"] = f.pop("_id", None)

        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(fees)} fees")
        return {
            "count": total,
            "page": page,
            "page_size": page_size,
            "fees": fees,
        }
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch fees: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch fees")





@router.get("/fees/search", response_model=List[FeeInDB])
async def search_fees(
    student_name: Optional[str] = None,
    class_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Search fees by student name, class, and/or status"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Searching fees")
    
    try:
        filters: Dict = {"school_id": school_id} if school_id else {}
        if class_id:
            filters["class_id"] = class_id
        if status:
            filters["status"] = status

        # If student_name provided, find matching students then filter by their student_id
        if student_name:
            student_filters = {"full_name": {"$regex": student_name, "$options": "i"}}
            if school_id:
                student_filters["school_id"] = school_id
            students = get_all_students(student_filters)
            if students:
                student_ids = [s.get("student_id") for s in students if s.get("student_id")]
                if student_ids:
                    filters["student_id"] = {"$in": student_ids}
                else:
                    logger.warning(f"[SCHOOL:{school_id or 'All'}] No matching student IDs found")
                    return []
            else:
                logger.warning(f"[SCHOOL:{school_id or 'All'}] No matching students found")
                return []

        fees = get_all_fees(filters, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Search returned {len(fees)} fees")
        return fees
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to search fees: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search fees")

@router.get("/fees/{fee_id}", response_model=FeeInDB)
async def get_fee(
    fee_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get fee by ID"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching fee {fee_id}")
    
    try:
        fee = get_fee_by_id(fee_id, school_id=school_id)
        if not fee:
            logger.warning(f"[SCHOOL:{school_id or 'All'}] Fee {fee_id} not found")
            raise HTTPException(status_code=404, detail="Fee not found")
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Fee {fee_id} found")
        return fee
    except HTTPException as he:
        # If nothing was found, return an empty Excel file instead of 404 so frontend can download a file
        if getattr(he, 'status_code', None) == 404:
            try:
                wb = Workbook()
                ws = wb.active
                ws.title = "Fees"
                headers = ["Name", "Roll Number", "Registration ID", "Class", "Section", "Total Fee", "Paid Amount", "Remaining", "Arrears", "Scholarship %", "Scholarship Amount", "Status"]
                header_font = Font(bold=True, color="FFFFFF", size=11)
                header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
                thin_border = Border(
                    left=Side(style="thin"), right=Side(style="thin"),
                    top=Side(style="thin"), bottom=Side(style="thin")
                )
                for col_idx, header in enumerate(headers, start=1):
                    cell = ws.cell(row=1, column=col_idx, value=header)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = Alignment(horizontal="center")
                    cell.border = thin_border
                    ws.column_dimensions[cell.column_letter].width = max(len(header) + 4, 14)

                ws.cell(row=2, column=1, value=str(he.detail or "No records found"))

                bio = BytesIO()
                wb.save(bio)
                bio.seek(0)

                from datetime import datetime
                filename = f"fee_report_empty_{datetime.now().strftime('%Y%m%d')}.xlsx"

                return StreamingResponse(
                    bio,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"}
                )
            except Exception:
                # If generating the empty file fails, re-raise the original 404
                raise
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch fee: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch fee")

@router.get("/students/{student_id}/fees", response_model=List[FeeInDB])
async def get_student_fees(
    student_id: str,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Get all fees for a specific student"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id or 'All'}] [ADMIN:{admin_email}] Fetching fees for student {student_id}")
    
    try:
        fees = get_fees_by_student(student_id, school_id=school_id)
        logger.info(f"[SCHOOL:{school_id or 'All'}] ✅ Retrieved {len(fees)} fees for student {student_id}")
        return fees
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id or 'All'}] ❌ Failed to fetch student fees: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch student fees")

@router.post("/fees", response_model=FeeInDB)
async def create_new_fee(
    fee_data: FeeCreate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Create new fee"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Creating fee")
    
    try:
        fee_dict = fee_data.dict()
        fee_dict["generated_by"] = current_user["id"]  # Set the user who created the fee
        fee = create_fee(fee_dict, school_id=school_id)
        if not fee:
            logger.warning(f"[SCHOOL:{school_id}] Fee creation failed")
            raise HTTPException(status_code=400, detail="Invalid fee data")
        logger.info(f"[SCHOOL:{school_id}] ✅ Fee {fee.get('_id')} created")
        return fee
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to create fee: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create fee")

@router.post("/fees/generate")
async def generate_fees(
    fee_data: FeeGenerate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Generate fees for multiple students"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Generating fees for class")
    
    try:
        filters = {"class_id": fee_data.class_id}
        if school_id:
            filters["school_id"] = school_id
        students = get_all_students(filters) if hasattr(fee_data, 'class_id') else []

        created_fees = []
        for student in students:
            fee_dict = {
                "student_id": student["student_id"],
                "class_id": student["class_id"],
                "fee_type": fee_data.fee_type,
                "amount": fee_data.amount,
                "due_date": fee_data.due_date,
                "status": "pending",
                "generated_by": current_user["id"]
            }
            fee = create_fee(fee_dict, school_id=school_id)
            if fee:
                created_fees.append(fee)

        logger.info(f"[SCHOOL:{school_id}] ✅ Generated {len(created_fees)} fees")
        return {"count": len(created_fees), "fees": created_fees}
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to generate fees: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate fees")

@router.put("/fees/{fee_id}", response_model=FeeInDB)
async def update_existing_fee(
    fee_id: str,
    fee_data: FeeUpdate,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Update fee"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Updating fee {fee_id}")
    
    try:
        update_data = fee_data.dict(exclude_unset=True)
        fee = update_fee(fee_id, school_id=school_id, **update_data)
        if not fee:
            logger.warning(f"[SCHOOL:{school_id}] Fee {fee_id} not found")
            raise HTTPException(status_code=404, detail="Fee not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Fee {fee_id} updated")
        return fee
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to update fee: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update fee")

@router.delete("/fees/{fee_id}")
async def delete_existing_fee(
    fee_id: str,
    current_user: dict = Depends(check_permission("fees.manage"))
):
    """Delete fee"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] Deleting fee {fee_id}")
    
    try:
        if not delete_fee(fee_id, school_id=school_id):
            logger.warning(f"[SCHOOL:{school_id}] Fee {fee_id} not found")
            raise HTTPException(status_code=404, detail="Fee not found")
        logger.info(f"[SCHOOL:{school_id}] ✅ Fee {fee_id} deleted")
        return {"message": "Fee deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHOOL:{school_id}] ❌ Failed to delete fee: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete fee")

@router.get("/fees/export")
async def export_fees_by_status(
    class_id: str,
    status: str,
    section: str = None,
    current_user: dict = Depends(check_permission("fees.view"))
):
    """Export fee report by status (paid/partial/unpaid) for a class, optionally filtered by section"""
    school_id = current_user.get("school_id")
    admin_email = current_user.get("email")
    print(f"\n{'='*80}")
    print(f"[EXPORT] START | class_id={class_id} section={section} status={status}")
    logger.info(f"[SCHOOL:{school_id}] [ADMIN:{admin_email}] [EXPORT] Exporting {status} for class {class_id} section {section}")
    
    try:
        db = get_db()
        import time
        start_ts = time.time()

        # Fetch class info
        try:
            class_doc = db.classes.find_one({"_id": ObjectId(class_id), "school_id": school_id})
        except Exception:
            class_doc = db.classes.find_one({"_id": class_id, "school_id": school_id})
        if not class_doc:
            logger.warning(f"[EXPORT] Class {class_id} not found")
            raise HTTPException(status_code=404, detail="Class not found")
        
        class_name = class_doc.get("class_name", "Unknown")
        logger.info(f"[EXPORT] Class: {class_name}")
        
        # Fetch active fee category via class_fee_assignments (not class.fee_category)
        total_fee_amount = 0
        print(f"[EXPORT] Looking up assignment for class_id={class_id}, school_id={school_id}")
        try:
            assignment = db.class_fee_assignments.find_one({
                "class_id": class_id,
                "school_id": school_id,
                "is_active": True
            })
            print(f"[EXPORT] Assignment found: {assignment is not None}")
            if assignment:
                print(f"[EXPORT] ✅ Assignment doc: {assignment}")
                category_id = assignment.get("category_id")
                print(f"[EXPORT] Category ID from assignment: {category_id}")
                if category_id:
                    try:
                        cat_obj_id = ObjectId(category_id) if isinstance(category_id, str) else category_id
                    except:
                        cat_obj_id = category_id
                    
                    cat = db.fee_categories.find_one({"_id": cat_obj_id})
                    print(f"[EXPORT] Fee category lookup result: {cat is not None}")
                    if cat:
                        print(f"[EXPORT] Category name: {cat.get('name')}")
                        print(f"[EXPORT] Category doc keys: {list(cat.keys())}")
                        
                        if "total_amount" in cat and isinstance(cat.get("total_amount"), (int, float)):
                            total_fee_amount = cat.get("total_amount", 0)
                            print(f"[EXPORT] ✅ Using total_amount: PKR {total_fee_amount}")
                        elif isinstance(cat.get("components"), list):
                            components = cat.get("components", [])
                            print(f"[EXPORT] Components found: {len(components)} items")
                            for idx, comp in enumerate(components):
                                print(f"[EXPORT]   Component {idx}: {comp}")
                            total_fee_amount = sum((comp.get("amount", 0) for comp in components))
                            print(f"[EXPORT] ✅ Calculated from components: PKR {total_fee_amount}")
                        else:
                            print(f"[EXPORT] ⚠️ No total_amount or components found in category")
                            
                        logger.info(f"[EXPORT] Fee: {cat.get('name', '?')} = {total_fee_amount} PKR")
                    else:
                        print(f"[EXPORT] ❌ Category document not found for ID {category_id}")
                        print(f"[EXPORT] Trying to search all categories...")
                        all_cats = list(db.fee_categories.find({}))
                        print(f"[EXPORT] Total categories in DB: {len(all_cats)}")
                        for c in all_cats[:3]:
                            print(f"[EXPORT]   Sample category: {c.get('_id')} - {c.get('name')}")
                else:
                    print(f"[EXPORT] ❌ No category_id in assignment document")
            else:
                print(f"[EXPORT] ❌ No active assignment found for this class")
                print(f"[EXPORT] Checking all assignments for this class...")
                all_assignments = list(db.class_fee_assignments.find({"class_id": class_id}))
                print(f"[EXPORT] Total assignments for class: {len(all_assignments)}")
                for a in all_assignments:
                    print(f"[EXPORT]   Assignment: school_id={a.get('school_id')} is_active={a.get('is_active')}")
        except Exception as e:
            print(f"[EXPORT] ❌ Fee category lookup failed: {str(e)}")
            import traceback
            traceback.print_exc()
            logger.warning(f"[EXPORT] Fee category lookup failed: {str(e)}")
        
        # Fetch all students in this class (optionally filter by section)
        student_query = {"school_id": school_id, "class_id": class_id}
        if section:
            student_query["section"] = section
            print(f"[EXPORT] Querying students with: {student_query} (with section filter)")
        else:
            print(f"[EXPORT] Querying students with: {student_query} (all sections)")
        
        students = list(db.students.find(
            student_query,
            {"full_name": 1, "roll_number": 1, "registration_number": 1, "student_id": 1, 
             "section": 1, "scholarship_percent": 1, "scholarship": 1, "arrears_balance": 1, "arrears": 1}
        ))
        print(f"[EXPORT] Found {len(students)} students")
        if students:
            print(f"[EXPORT] Sample students: {[s.get('full_name') for s in students[:3]]}")

        logger.info(f"[EXPORT] Found {len(students)} students in {round((time.time()-start_ts), 2)}s")

        if not students:
            print(f"[EXPORT] ⚠️ No students found in this class")
            logger.info(f"[EXPORT] Empty class → empty report")
            # Return empty Excel (headers + note)
            wb = Workbook()
            ws = wb.active
            ws.title = f"{status.capitalize()} Fees"
            headers = ["Name", "Roll Number", "Registration ID", "Class", "Section", 
                       "Total Fee", "Paid Amount", "Remaining", "Arrears", 
                       "Scholarship %", "Scholarship Amount", "Status"]
            header_font = Font(bold=True, color="FFFFFF", size=11)
            header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
            thin_border = Border(
                left=Side(style="thin"), right=Side(style="thin"),
                top=Side(style="thin"), bottom=Side(style="thin")
            )
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")
                cell.border = thin_border
                ws.column_dimensions[cell.column_letter].width = max(len(header) + 4, 14)
            ws.cell(row=2, column=1, value=f"No students in class")
            bio = BytesIO()
            wb.save(bio)
            bio.seek(0)
            from datetime import datetime
            filename = f"fee_report_{class_name.replace(' ', '_')}_{status}_{datetime.now().strftime('%Y%m%d')}.xlsx"
            return StreamingResponse(
                bio,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )

        # Build payment search candidates (ObjectId string, student_id, registration_number)
        payment_search_ids = set()
        for s in students:
            payment_search_ids.add(str(s["_id"]))
            if s.get("student_id"):
                payment_search_ids.add(s.get("student_id"))
            if s.get("registration_number"):
                payment_search_ids.add(s.get("registration_number"))
        
        payment_search_ids = list(payment_search_ids)
        print(f"[EXPORT] Payment search IDs: {len(payment_search_ids)} candidates")
        print(f"[EXPORT] Sample IDs: {payment_search_ids[:3]}")
        logger.info(f"[EXPORT] Payment search IDs: {len(payment_search_ids)} candidates")
        
        # Bulk fetch payments for matching students
        fee_summaries = {}
        if payment_search_ids:
            try:
                print(f"[EXPORT] Aggregating payments for {len(payment_search_ids)} student IDs")
                payments = list(db.fee_payments.aggregate([
                    {"$match": {"student_id": {"$in": payment_search_ids}, "school_id": school_id}},
                    {"$group": {
                        "_id": "$student_id",
                        "total_paid": {"$sum": "$amount_paid"}
                    }}
                ]))
                print(f"[EXPORT] Payment aggregation returned {len(payments)} results")
                print(f"[EXPORT] Sample payments: {payments[:3] if payments else 'None'}")
                for p in payments:
                    fee_summaries[p["_id"]] = p.get("total_paid", 0)
                logger.info(f"[EXPORT] Matched payments for {len(fee_summaries)} students")
                print(f"[EXPORT] Enriched student count with payments: {len(fee_summaries)}")
            except Exception as e:
                print(f"[EXPORT] ❌ Payment aggregation failed: {str(e)}")
                logger.warning(f"[EXPORT] Payment aggregation failed: {str(e)}")
        
        # Calculate status for each student and build rows
        rows = []
        status_counts = {"paid": 0, "partial": 0, "unpaid": 0}
        print(f"[EXPORT] Processing {len(students)} students for status calculation...")
        print(f"[EXPORT] ⚠️ CRITICAL: Total fee amount to use: PKR {total_fee_amount}")
        
        if total_fee_amount == 0:
            print(f"[EXPORT] ❌❌❌ ALERT: total_fee_amount is 0! This will mark ALL students as PAID ❌❌❌")
        
        for idx, student in enumerate(students):
            sid = str(student["_id"])
            paid_amount = fee_summaries.get(sid, 0)
            arrears = student.get("arrears_balance") or student.get("arrears") or 0
            scholarship_percent = student.get("scholarship_percent") or student.get("scholarship") or 0
            scholarship_amount = round((total_fee_amount * scholarship_percent) / 100) if total_fee_amount > 0 else 0
            remaining = total_fee_amount - paid_amount + arrears - scholarship_amount
            
            # Determine fee status based on remaining balance
            if remaining <= 0:
                fee_status = "paid"
            elif paid_amount > 0:
                fee_status = "partial"
            else:
                fee_status = "unpaid"
            
            # Show calculation for all students to identify the issue
            calc_str = f"Student {idx+1}: {student.get('full_name')} | total_fee={total_fee_amount} paid={paid_amount} arrears={arrears} scholarship%={scholarship_percent} remaining={remaining} → {fee_status.upper()}"
            print(f"[EXPORT] {calc_str}")
            
            status_counts[fee_status] += 1
            
            # Only include if status matches requested export type
            if status.lower() != fee_status:
                if idx < 3:
                    print(f"[EXPORT]   ⊘ Filtered out (want {status}, got {fee_status})")
                continue
            
            rows.append({
                "name": student.get("full_name", ""),
                "roll_number": student.get("roll_number", ""),
                "registration_id": student.get("registration_number") or student.get("student_id", ""),
                "class": class_name,
                "section": student.get("section", ""),
                "total_fee": total_fee_amount,
                "paid_amount": paid_amount,
                "remaining_amount": max(0, remaining),
                "arrears": arrears,
                "scholarship_percent": scholarship_percent,
                "scholarship_amount": scholarship_amount,
                "status": fee_status.capitalize()
            })
        
        print(f"[EXPORT] ═══════════════════════════════════════════════════════════════════")
        print(f"[EXPORT] Status breakdown: paid={status_counts['paid']} partial={status_counts['partial']} unpaid={status_counts['unpaid']}")
        print(f"[EXPORT] Filtered rows for {status.upper()}: {len(rows)} records")
        logger.info(f"[EXPORT] Totals: paid={status_counts['paid']} partial={status_counts['partial']} unpaid={status_counts['unpaid']} | Selected {len(rows)} {status}")
        
        # Generate Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = f"{status.capitalize()} Fees"
        
        # Headers with styling
        headers = ["Name", "Roll Number", "Registration ID", "Class", "Section", 
                   "Total Fee", "Paid Amount", "Remaining", "Arrears", 
                   "Scholarship %", "Scholarship Amount", "Status"]
        
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
        thin_border = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin")
        )
        
        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border
            ws.column_dimensions[cell.column_letter].width = max(len(header) + 4, 14)
        
        # Data rows (or message if empty)
        if rows:
            for row_idx, row_data in enumerate(rows, start=2):
                values = [
                    row_data["name"], row_data["roll_number"], row_data["registration_id"],
                    row_data["class"], row_data["section"], row_data["total_fee"], 
                    row_data["paid_amount"], row_data["remaining_amount"], row_data["arrears"], 
                    row_data["scholarship_percent"], row_data["scholarship_amount"], row_data["status"]
                ]
                for col_idx, value in enumerate(values, start=1):
                    cell = ws.cell(row=row_idx, column=col_idx, value=value)
                    cell.border = thin_border
                    if col_idx > 5:
                        cell.alignment = Alignment(horizontal="right")
        else:
            ws.cell(row=2, column=1, value=f"No {status} students in this class")
        
        # Save to bytes and return
        bio = BytesIO()
        wb.save(bio)
        bio.seek(0)
        
        from datetime import datetime
        filename = f"fee_report_{class_name.replace(' ', '_')}_{status}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        elapsed = round((time.time()-start_ts), 2)
        print(f"[EXPORT] ✅ Generated {len(rows)} rows | {elapsed}s")
        print(f"[EXPORT] Filename: {filename}")
        print(f"{'='*80}\n")
        logger.info(f"[EXPORT] ✅ {len(rows)} rows | {elapsed}s")
        
        return StreamingResponse(
            bio,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[EXPORT] ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"[EXPORT] ❌ {str(e)}")
        print(f"{'='*80}\n")
        raise HTTPException(status_code=500, detail=str(e))