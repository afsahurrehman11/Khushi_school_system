"""
Excel service for Student Import / Export.

Handles:
- Sample template generation
- File parsing, validation, normalization
- Export to xlsx
- Error report generation
- Formula stripping for security
"""

import re
from io import BytesIO
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

TEMPLATE_COLUMNS = [
    "Student_ID",
    "Full_Name",
    "Roll_Number",
    "Class",
    "Section",
    "Gender",
    "Date_of_Birth",
    "Parent_Name",
    "Parent_CNIC",
    "Parent_Contact",
    "Address",
    "Admission_Date",
]

REQUIRED_COLUMNS = {"Student_ID", "Full_Name", "Roll_Number", "Class", "Parent_CNIC"}

EXAMPLE_ROW = [
    "STU2025001",
    "Ali Ahmed",
    "101",
    "Grade-5",
    "A",
    "Male",
    "2015-03-22",
    "Ahmed Khan",
    "12345-1234567-1",
    "03001234567",
    "123 Main St, Lahore",
    "2025-04-01",
]

GENDER_MAP: Dict[str, str] = {
    "m": "Male",
    "male": "Male",
    "boy": "Male",
    "f": "Female",
    "female": "Female",
    "girl": "Female",
    "o": "Other",
    "other": "Other",
}

# ---------------------------------------------------------------------------
# Security — strip Excel injection formulas
# ---------------------------------------------------------------------------

_FORMULA_RE = re.compile(r"^[\s]*[=+\-@]")


def _sanitize_cell(value: Any) -> Any:
    """Strip leading formula characters to prevent CSV/Excel injection."""
    if isinstance(value, str):
        value = value.strip()
        # Remove BOM, zero-width chars, etc.
        value = value.replace("\u200b", "").replace("\ufeff", "").replace("\u200c", "").replace("\u200d", "")
        if _FORMULA_RE.match(value):
            value = "'" + value  # Excel will display without formula execution
    return value


# ---------------------------------------------------------------------------
# Template Generation
# ---------------------------------------------------------------------------


def generate_sample_template() -> bytes:
    """Generate a sample .xlsx template with column headers, formatting, and one example row."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"

    # Styles
    header_fill_required = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_fill_optional = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    example_font = Font(italic=True, color="808080")
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_idx, col_name in enumerate(TEMPLATE_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill_required if col_name in REQUIRED_COLUMNS else header_fill_optional
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border
        ws.column_dimensions[cell.column_letter].width = max(len(col_name) + 6, 16)

    # Example row
    for col_idx, val in enumerate(EXAMPLE_ROW, start=1):
        cell = ws.cell(row=2, column=col_idx, value=val)
        cell.font = example_font
        cell.border = thin_border

    # Instructions row
    ws.cell(row=4, column=1, value="Instructions:").font = Font(bold=True)
    ws.cell(row=5, column=1, value="• Dark blue columns are REQUIRED.").font = Font(color="1F4E79")
    ws.cell(row=6, column=1, value="• Light blue columns are optional.").font = Font(color="4472C4")
    ws.cell(row=7, column=1, value="• Date format: YYYY-MM-DD").font = Font(color="808080")
    ws.cell(row=8, column=1, value="• Gender: Male / Female / Other").font = Font(color="808080")
    ws.cell(row=9, column=1, value="• Remove this example row before importing.").font = Font(color="808080")

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read()


# ---------------------------------------------------------------------------
# Parsing & Validation
# ---------------------------------------------------------------------------


def _normalize_gender(raw: str) -> str:
    """Normalize gender value; raise ValueError if invalid."""
    key = raw.strip().lower()
    if key in GENDER_MAP:
        return GENDER_MAP[key]
    if not key:
        return ""
    raise ValueError(f"Invalid gender value: '{raw}'. Expected Male/Female/Other")


def _validate_date(raw: str, col_name: str) -> str:
    """Validate YYYY-MM-DD date; return the cleaned string."""
    if not raw:
        return ""
    raw = raw.strip()
    try:
        datetime.strptime(raw, "%Y-%m-%d")
        return raw
    except ValueError:
        raise ValueError(f"Invalid date format for {col_name}: '{raw}'. Expected YYYY-MM-DD")


def _build_col_map(header_row: tuple) -> Dict[str, int]:
    """Build a case-insensitive header → column-index map."""
    col_map: Dict[str, int] = {}
    cleaned_headers = []
    for idx, h in enumerate(header_row):
        name = str(h).strip() if h is not None else ""
        cleaned_headers.append(name)
        # Normalize to match template column names (case-insensitive, underscores)
        key = name.replace(" ", "_").lower()
        col_map[key] = idx
    return col_map


def _check_template_match(col_map: Dict[str, int]) -> Optional[str]:
    """Return an error message if the uploaded file doesn't match the template."""
    expected_keys = {c.lower() for c in TEMPLATE_COLUMNS}
    found_keys = set(col_map.keys())
    missing = {c.lower() for c in REQUIRED_COLUMNS} - found_keys
    if missing:
        return f"Uploaded file structure does not match the sample template. Missing required columns: {', '.join(sorted(missing))}"
    return None


def parse_and_validate_rows(xlsx_bytes: bytes) -> Dict[str, Any]:
    """
    Parse xlsx bytes.  Return:
    {
        "total_rows": int,
        "valid_rows": [...],
        "error_rows": [...],   # {row, column, value, reason}
        "duplicate_rows": [...],
        "duplicate_ids": set,
    }
    No DB access here — pure data validation.
    """
    wb = openpyxl.load_workbook(filename=BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return {"total_rows": 0, "valid_rows": [], "error_rows": [{"row": 0, "column": "-", "value": "-", "reason": "Empty workbook"}], "duplicate_rows": [], "duplicate_ids": set()}

    col_map = _build_col_map(header_row)

    # Template structure check
    mismatch_err = _check_template_match(col_map)
    if mismatch_err:
        return {"total_rows": 0, "valid_rows": [], "error_rows": [{"row": 0, "column": "-", "value": "-", "reason": mismatch_err}], "duplicate_rows": [], "duplicate_ids": set()}

    valid_rows: List[Dict[str, Any]] = []
    error_rows: List[Dict[str, Any]] = []
    duplicate_rows: List[Dict[str, Any]] = []
    seen_student_ids: set = set()
    seen_roll_numbers: set = set()

    def _cell(row_data: tuple, key: str) -> str:
        idx = col_map.get(key)
        if idx is None or idx >= len(row_data) or row_data[idx] is None:
            return ""
        return str(_sanitize_cell(row_data[idx])).strip()

    for row_num, row_data in enumerate(rows_iter, start=2):
        # Skip completely empty rows
        if all(c is None or str(c).strip() == "" for c in row_data):
            continue

        row_errors: List[Dict[str, Any]] = []

        student_id = _cell(row_data, "student_id")
        full_name = _cell(row_data, "full_name")
        roll_number = _cell(row_data, "roll_number")
        class_val = _cell(row_data, "class")
        section = _cell(row_data, "section")
        gender_raw = _cell(row_data, "gender")
        dob_raw = _cell(row_data, "date_of_birth")
        parent_name = _cell(row_data, "parent_name")
        parent_cnic = _cell(row_data, "parent_cnic")
        parent_contact = _cell(row_data, "parent_contact")
        address = _cell(row_data, "address")
        admission_date_raw = _cell(row_data, "admission_date")

        # Required field checks
        if not student_id:
            row_errors.append({"row": row_num, "column": "Student_ID", "value": "", "reason": "Required field missing"})
        if not full_name:
            row_errors.append({"row": row_num, "column": "Full_Name", "value": "", "reason": "Required field missing"})
        if not roll_number:
            row_errors.append({"row": row_num, "column": "Roll_Number", "value": "", "reason": "Required field missing"})
        if not class_val:
            row_errors.append({"row": row_num, "column": "Class", "value": "", "reason": "Required field missing"})
        if not parent_cnic:
            row_errors.append({"row": row_num, "column": "Parent_CNIC", "value": "", "reason": "Required field missing"})

        # Gender normalization
        gender = ""
        if gender_raw:
            try:
                gender = _normalize_gender(gender_raw)
            except ValueError as e:
                row_errors.append({"row": row_num, "column": "Gender", "value": gender_raw, "reason": str(e)})

        # Date validation
        dob = ""
        if dob_raw:
            try:
                dob = _validate_date(dob_raw, "Date_of_Birth")
            except ValueError as e:
                row_errors.append({"row": row_num, "column": "Date_of_Birth", "value": dob_raw, "reason": str(e)})

        admission_date = ""
        if admission_date_raw:
            try:
                admission_date = _validate_date(admission_date_raw, "Admission_Date")
            except ValueError as e:
                row_errors.append({"row": row_num, "column": "Admission_Date", "value": admission_date_raw, "reason": str(e)})

        # In-file duplicate detection
        is_dup = False
        if student_id and student_id in seen_student_ids:
            duplicate_rows.append({"row": row_num, "column": "Student_ID", "value": student_id, "reason": "Duplicate Student_ID within file"})
            is_dup = True
        if roll_number and roll_number in seen_roll_numbers:
            duplicate_rows.append({"row": row_num, "column": "Roll_Number", "value": roll_number, "reason": "Duplicate Roll_Number within file"})
            is_dup = True

        if student_id:
            seen_student_ids.add(student_id)
        if roll_number:
            seen_roll_numbers.add(roll_number)

        if row_errors:
            error_rows.extend(row_errors)
            continue

        if is_dup:
            continue

        # Build normalized row
        valid_rows.append({
            "row_num": row_num,
            "student_id": student_id,
            "full_name": full_name,
            "roll_number": roll_number,
            "class_id": class_val,
            "section": section or "A",
            "gender": gender or "Not specified",
            "date_of_birth": dob or datetime.utcnow().strftime("%Y-%m-%d"),
            "parent_name": parent_name,
            "parent_cnic": parent_cnic,
            "parent_contact": parent_contact,
            "address": address,
            "admission_date": admission_date or datetime.utcnow().strftime("%Y-%m-%d"),
        })

    wb.close()

    return {
        "total_rows": len(valid_rows) + len(error_rows) + len(duplicate_rows),
        "valid_rows": valid_rows,
        "error_rows": error_rows,
        "duplicate_rows": duplicate_rows,
        "duplicate_ids": seen_student_ids,
    }


def check_db_duplicates(valid_rows: List[Dict], db) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Check valid rows against database for duplicates.
    Returns (clean_rows, db_duplicate_rows, db_existing_records_for_update).
    """
    clean: List[Dict] = []
    db_dups: List[Dict] = []
    existing_for_update: List[Dict] = []

    for row in valid_rows:
        sid = row["student_id"]
        rn = row["roll_number"]

        existing_by_id = db.students.find_one({"student_id": sid})
        existing_by_roll = db.students.find_one({"roll_number": rn, "class_id": row["class_id"]})

        if existing_by_id:
            db_dups.append({"row": row["row_num"], "column": "Student_ID", "value": sid, "reason": "Duplicate value — already exists in database"})
            existing_for_update.append({**row, "_existing_id": str(existing_by_id["_id"])})
        elif existing_by_roll:
            db_dups.append({"row": row["row_num"], "column": "Roll_Number", "value": rn, "reason": "Duplicate value — already exists in database"})
            existing_for_update.append({**row, "_existing_id": str(existing_by_roll["_id"])})
        else:
            clean.append(row)

    return clean, db_dups, existing_for_update


# ---------------------------------------------------------------------------
# Import Execution (transactional)
# ---------------------------------------------------------------------------


def build_student_doc(row: Dict) -> Dict:
    """Convert a validated row dict into the document shape expected by create_student."""
    now = datetime.utcnow()
    return {
        "student_id": row["student_id"],
        "full_name": row["full_name"],
        "roll_number": row["roll_number"],
        "class_id": row["class_id"],
        "section": row["section"],
        "gender": row["gender"],
        "date_of_birth": row["date_of_birth"],
        "admission_date": row["admission_date"],
        "guardian_info": {
            "father_name": row.get("parent_name", ""),
            "parent_cnic": row.get("parent_cnic", ""),
            "guardian_contact": row.get("parent_contact", ""),
            "address": row.get("address", ""),
        },
        "contact_info": {
            "phone": row.get("parent_contact", ""),
        },
        "subjects": [],
        "assigned_teacher_ids": [],
        "status": "active",
        "academic_year": f"{now.year}-{now.year + 1}",
        "created_at": now,
        "updated_at": now,
    }


def execute_import_transaction(
    rows_to_insert: List[Dict],
    rows_to_update: List[Dict],
    duplicate_action: str,
    db,
) -> Tuple[int, int, List[Dict]]:
    """
    Execute the import inside a MongoDB client session / transaction where supported.
    Returns (success_count, fail_count, errors).
    All-or-nothing: if any write fails, the entire batch is rolled back.
    """
    docs_to_insert = [build_student_doc(r) for r in rows_to_insert]

    update_docs = []
    if duplicate_action == "update":
        for r in rows_to_update:
            doc = build_student_doc(r)
            doc.pop("created_at", None)
            update_docs.append((r["_existing_id"], doc))

    success = 0
    errors: List[Dict] = []

    # Try using a session/transaction (requires replica set)
    client = db.client
    try:
        with client.start_session() as session:
            with session.start_transaction():
                if docs_to_insert:
                    db.students.insert_many(docs_to_insert, session=session)
                    success += len(docs_to_insert)

                for eid, doc in update_docs:
                    from bson.objectid import ObjectId
                    db.students.update_one(
                        {"_id": ObjectId(eid)},
                        {"$set": doc},
                        session=session,
                    )
                    success += 1
    except Exception:
        # Standalone MongoDB — no transaction support; fall back to ordered bulk
        success = 0
        errors = []
        try:
            if docs_to_insert:
                db.students.insert_many(docs_to_insert, ordered=True)
                success += len(docs_to_insert)

            for eid, doc in update_docs:
                from bson.objectid import ObjectId
                db.students.update_one({"_id": ObjectId(eid)}, {"$set": doc})
                success += 1
        except Exception as exc:
            # If bulk insert partially fails, we can't easily roll back in standalone.
            # Delete any docs just inserted in this batch to honour all-or-nothing.
            inserted_ids = [d["student_id"] for d in docs_to_insert]
            if inserted_ids:
                db.students.delete_many({"student_id": {"$in": inserted_ids}})
            return 0, len(docs_to_insert) + len(update_docs), [{"row": 0, "column": "-", "value": "-", "reason": f"Transaction failed: {str(exc)}"}]

    return success, 0, errors


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_students_xlsx(students: List[Dict]) -> bytes:
    """Export students list to xlsx bytes matching the template structure."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"

    # Header styles
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    for col_idx, col_name in enumerate(TEMPLATE_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border
        ws.column_dimensions[cell.column_letter].width = max(len(col_name) + 6, 16)

    for row_idx, s in enumerate(students, start=2):
        guardian = s.get("guardian_info") or {}
        contact = s.get("contact_info") or {}
        row_data = [
            _sanitize_cell(s.get("student_id", "")),
            _sanitize_cell(s.get("full_name", "")),
            _sanitize_cell(s.get("roll_number", "")),
            _sanitize_cell(s.get("class_id", "") or s.get("class", "")),
            _sanitize_cell(s.get("section", "")),
            _sanitize_cell(s.get("gender", "")),
            _sanitize_cell(s.get("date_of_birth", "")),
            _sanitize_cell(guardian.get("father_name", "") or guardian.get("guardian_name", "")),
            _sanitize_cell(guardian.get("parent_cnic", "")),
            _sanitize_cell(guardian.get("guardian_contact", "") or contact.get("phone", "")),
            _sanitize_cell(guardian.get("address", "") or s.get("address", "")),
            _sanitize_cell(s.get("admission_date", "")),
        ]
        for col_idx, val in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read()


# ---------------------------------------------------------------------------
# Error Report
# ---------------------------------------------------------------------------


def generate_error_report(errors: List[Dict]) -> bytes:
    """Generate students_import_errors.xlsx from error list."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Import Errors"

    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="C00000", end_color="C00000", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    headers = ["Row", "Column", "Provided Value", "Error Reason"]
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border
        ws.column_dimensions[cell.column_letter].width = 25

    for row_idx, err in enumerate(errors, start=2):
        ws.cell(row=row_idx, column=1, value=err.get("row", "")).border = thin_border
        ws.cell(row=row_idx, column=2, value=err.get("column", "")).border = thin_border
        ws.cell(row=row_idx, column=3, value=_sanitize_cell(err.get("value", ""))).border = thin_border
        ws.cell(row=row_idx, column=4, value=err.get("reason", "")).border = thin_border

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read()
