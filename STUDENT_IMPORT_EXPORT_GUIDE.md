# Student Import/Export System Guide

## Overview
The system allows School Admins to bulk import and export student data via Excel files with optional student photos for automatic face recognition setup.

---

## Required Excel Columns (Must be present)

| Column | Description | Format | Example |
|--------|-------------|--------|---------|
| **Student_ID** | Unique student identifier (numeric) | Number | 1, 101, 5023 |
| **Full_Name** | Student's complete name | Text | Ali Ahmed |
| **Roll_Number** | Roll number in class | Text/Number | 101, A-01 |
| **Class** | Class/Grade name | Text | Grade-5, Class-10 |
| **Section** | Section/Division letter | Text | A, B, 1, 2 |
| **Father_CNIC** | Father's CNIC (ID number) | Text (XXXXX-XXXXXXX-X) | 12345-1234567-1 |

---

## Optional Excel Columns (Can skip or leave blank)

| Column | Description | Format | Example |
|--------|-------------|--------|---------|
| Father_Name | Father's full name | Text | Ahmed Khan |
| Gender | Student's gender | Male/Female/Other | Male |
| Date_of_Birth | Birth date | YYYY-MM-DD | 2015-03-22 |
| Parent_Contact | Phone number | Text | 03001234567 |
| Address | Home address | Text | 123 Main St, Lahore |
| Admission_Date | Admission date | YYYY-MM-DD | 2025-04-01 |
| Image_Name | Photo filename from ZIP | Text (case-insensitive) | ali_ahmed.jpg |

---

## Import Process Flow

### Step 1: Download Template
- Click "Download Template" to get a sample Excel file
- Template contains required (dark blue) and optional (light blue) columns
- Includes one example row and instructions

### Step 2: Prepare Your Data
- Create Excel file (.xlsx format, max 10MB)
- Include all required columns in any order
- Keep column headers exactly as shown (spaces/underscores don't matter)
- Extra columns beyond the template are ignored
- Remove example rows before uploading

### Step 3: Prepare Images (Optional)
- Create a ZIP file containing student photos (.jpg, .png)
- Maximum ZIP size: 50MB
- Filenames must match "Image_Name" column in Excel (case-insensitive)
- Example: Excel has "ali_ahmed.jpg" → ZIP must have "ali_ahmed.jpg"
- Hidden files and nested folders with other file types are skipped

### Step 4: Upload Files
- Select Excel file (required)
- Select ZIP file with images (optional)
- Choose duplicate handling: **Skip** or **Update** existing students
- System shows preview with validation results

### Step 5: Confirm & Import
- Review preview showing valid rows and errors
- Click "Confirm" to start background import
- Get real-time notification when complete
- Download error report if there are failures

---

## Error Handling & Validation

### Excel Structure Errors
| Error | Cause | Solution |
|-------|-------|----------|
| Missing required columns | Excel doesn't have all 6 required columns | Add: Student_ID, Full_Name, Roll_Number, Class, Section, Father_CNIC |
| Empty file | Workbook has no data | Add student data rows below headers |
| File too large | Excel file > 10MB | Reduce number of students per import |

### Data Validation Errors
| Error | Cause | Solution |
|-------|-------|----------|
| Required field missing | A required field is empty | Fill in all required columns for every student |
| Invalid date format | Date not in YYYY-MM-DD format | Use YYYY-MM-DD (e.g., 2025-04-01) |
| Invalid gender | Gender not Male/Female/Other | Correct spelling or leave blank |
| Duplicate Student_ID (in file) | Same ID appears twice in Excel | Each student must have unique ID |
| Duplicate Roll_Number (in file) | Same roll number appears twice | Each student must have unique roll number |
| Duplicate in database | Student already exists | Use "Update" mode or change ID |
| Image not found in ZIP | Image_Name doesn't match ZIP filename | Ensure filenames match exactly (case-insensitive) |
| Image processing failed | Corrupted image or unsupported format | Use only .jpg or .png images |

### ZIP File Errors
| Error | Cause | Solution |
|-------|-------|----------|
| ZIP too large | ZIP > 50MB | Reduce image quality or zip fewer images |
| Invalid ZIP file | Corrupted ZIP or not a ZIP file | Re-create the ZIP file |
| Corrupted file in ZIP | One or more images corrupted | Extract and re-ZIP all images |

---

## Face Registration & Automatic Embedding Generation

### How Face Recognition Works

1. **Upon Import**: When a student is imported with an image:
   - Image is processed (resized to max 800px, compressed to 85% quality)
   - Stored as base64 blob in database
   - Face embedding status set to **"pending"**

2. **Automatic Processing** (During Import):
   - System automatically detects faces in imported photos
   - Generates digital face "fingerprint" (512-dimension vector)
   - Stores fingerprint in database
   - Updates status to **"generated"** or **"failed"**
   - Takes ~500ms-2s per student depending on image

3. **Face Attendance System**:
   - When student attends without manual check-in
   - System compares live camera feed to stored fingerprints
   - Goes through all student embeddings to find match
   - Registers attendance automatically if high confidence match

### Status States

- **pending**: Image uploaded, waiting for embedding generation
- **generated**: Face fingerprint created successfully
- **failed**: Could not detect face in image or generation failed

### Requirements for Face Recognition
- Clear student photo (face clearly visible)
- Good lighting (face not in shadow)
- Forward-facing angle (not profile, not angled)
- Only one face per image
- Standard formats: .jpg or .png
- Minimum resolution: 100x100 pixels (recommended: 400x400+)

---

## Export Process

### Export All Students
- Click "Export Students" to download all school students
- Generates Excel file with same template structure
- Includes only non-sensitive data
- For backup, reporting, or sharing with teachers

---

## Data Privacy & Security

- **School Isolation**: Each school sees only their own student data
- **Role-Based Access**: Only School Admins can import/export
- **Formula Injection Protection**: Excel formulas stripped/sanitized
- **Temporary Files**: ZIP files deleted after import completes
- **Image Encryption**: Base64 images stored in database with school isolation
- **Audit Trail**: All imports logged with timestamp and admin email

---

## Key Limits

| Item | Limit | Notes |
|------|-------|-------|
| Excel File Size | 10 MB | Uncompressed |
| ZIP File Size | 50 MB | Images only |
| Image Dimensions | Max 800px | Auto-resized |
| Image Count | 100s | Limited by ZIP size |
| Rows Per Import | 1000s | Limited by Excel size |
| Export Size | No limit | Limited by RAM/network |

---

## Summary: Complete Flow

```
Admin → Download Template
      → Fill Excel (6+ required columns)
      → Prepare Images in ZIP (optional)
      → Upload Excel + ZIP
      → Preview Results & Errors
      → Confirm Import
      → Background Processing:
         ├─ Validate data
         ├─ Insert students
         ├─ Process images
         └─ Generate face embeddings
      → Notification on Completion
      → Download Error Report (if needed)
```

---

## Troubleshooting

**Q: Import stuck on "processing"?**
- A: Check server logs or refresh status page. Large imports take time (1-2 sec per student with images).

**Q: Some students imported, but images failed?**
- A: Images are optional. Check error report for image-specific issues. Download and re-import with corrected images.

**Q: Face recognition not working for some students?**
- A: Image quality too poor, face not detected, or multiple faces. Re-upload with clearer photos.

**Q: Can I update existing students?**
- A: Yes! Set "Update" mode in duplicate handling. Matching students by Student_ID will be updated instead of skipped.

**Q: Can I import without images?**
- A: Yes! Images are completely optional. Import only Excel file without ZIP.
