#!/usr/bin/env python3
"""
Fix VGGFace2 references to VGGFace
"""

import os

# Fix embedding_job.py
embedding_job_path = "backend/app/services/embedding_job.py"
with open(embedding_job_path, 'r') as f:
    content = f.read()
content = content.replace("VGGFace2", "VGGFace")
with open(embedding_job_path, 'w') as f:
    f.write(content)
print(f"✅ Fixed {embedding_job_path}")

# Fix student_image_service.py
student_image_path = "backend/app/services/student_image_service.py"
with open(student_image_path, 'r') as f:
    content = f.read()
content = content.replace("VGGFace2", "VGGFace")
with open(student_image_path, 'w') as f:
    f.write(content)
print(f"✅ Fixed {student_image_path}")

# Fix teacher_image_service.py  
teacher_image_path = "backend/app/services/teacher_image_service.py"
with open(teacher_image_path, 'r') as f:
    content = f.read()
content = content.replace("VGGFace2", "VGGFace")
with open(teacher_image_path, 'w') as f:
    f.write(content)
print(f"✅ Fixed {teacher_image_path}")

# Fix student_import_export.py
student_import_path = "backend/app/routers/student_import_export.py"
if os.path.exists(student_import_path):
    with open(student_import_path, 'r') as f:
        content = f.read()
    content = content.replace("VGGFace2", "VGGFace")
    with open(student_import_path, 'w') as f:
        f.write(content)
    print(f"✅ Fixed {student_import_path}")

print("\n✨ All VGGFace2 references updated to VGGFace")
