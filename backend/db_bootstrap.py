"""
Idempotent Database Bootstrap Script
Initializes the entire database with all required entities:
- Users, Roles, Permissions
- Classes, Subjects
- Students
- Fees

Safe to re-run without duplication.
"""

from database import get_db
from datetime import datetime, timedelta
import random

def setup_database():
    """Main bootstrap function"""
    db = get_db()
    
    print("\n" + "="*70)
    print("DATABASE BOOTSTRAP - School ERP System")
    print("="*70)
    
    # Create indexes
    print("\n[1/7] Creating database indexes...")
    create_indexes(db)
    
    # Create roles
    print("\n[2/7] Creating roles and permissions...")
    create_roles(db)

    # Create branches
    print("\n[3/7] Creating school branches...")
    create_branches(db)
    
    # Create users
    print("\n[3/7] Creating default users...")
    create_users(db)
    
    # Create subjects
    print("\n[4/7] Creating subjects...")
    create_subjects(db)
    
    # Create classes
    print("\n[5/7] Creating classes...")
    create_classes(db)
    
    # Create students
    print("\n[6/7] Creating students (20+ dummy students)...")
    create_students(db)
    
    # Create fees
    print("\n[7/7] Creating sample fees...")
    create_fees(db)
    
    print("\n" + "="*70)
    print("DATABASE BOOTSTRAP COMPLETED SUCCESSFULLY!")
    print("="*70)
    
    display_summary(db)

def create_indexes(db):
    """Create all required indexes"""
    db.users.create_index("email", unique=True)
    db.roles.create_index("name", unique=True)
    db.students.create_index("student_id", unique=True)
    db.subjects.create_index("subject_code", unique=True)
    db.classes.create_index([("class_name", 1), ("section", 1)], unique=True)
    print("  OK - Indexes created")

def create_roles(db):
    # Approved permissions
    approved_permissions = [
        "system.manage_access",
        "students.read", "students.write",
        "teachers.read", "teachers.write",
        "academics.assign_subjects", "academics.view_classes",
        "fees.manage", "fees.view", "accounting.dashboard_view",
        "inventory.manage", "inventory.view", "sales.manage",
        "reports.view"
    ]

    # Remove deprecated permissions from all roles in DB
    for role in db.roles.find({}):
        cleaned_permissions = [p for p in role.get("permissions", []) if p in approved_permissions]
        if set(cleaned_permissions) != set(role.get("permissions", [])):
            db.roles.update_one({"_id": role["_id"]}, {"$set": {"permissions": cleaned_permissions, "updated_at": datetime.utcnow()}})
            print(f"  OK - Cleaned deprecated permissions from role: {role['name']}")

    # Create default roles with permissions
    default_roles = [
        {
            "name": "Root",
            "description": "Root system account - view-only overview across deployments",
            "permissions": ["system.view_overview"]
        },
        {
            "name": "Admin",
            "description": "Full system access",
            "permissions": approved_permissions.copy()
        },
        {
            "name": "Accountant",
            "description": "Manage fees and accounting dashboard",
            "permissions": [
                "students.read", "fees.manage", "fees.view", "accounting.dashboard_view", "reports.view"
            ]
        },
        {
            "name": "Teacher",
            "description": "View students, assign subjects, view classes",
            "permissions": [
                "students.read", "academics.view_classes", "academics.assign_subjects"
            ]
        },
        {
            "name": "Inventory Manager",
            "description": "Manage inventory and sales",
            "permissions": [
                "inventory.manage", "inventory.view", "sales.manage"
            ]
        },
    ]

    for role_data in default_roles:
        existing = db.roles.find_one({"name": role_data["name"]})
        if not existing:
            role_data["created_at"] = datetime.utcnow()
            role_data["updated_at"] = datetime.utcnow()
            db.roles.insert_one(role_data)
            print(f"  OK - Created role: {role_data['name']}")
        else:
            print(f"  - Role already exists: {role_data['name']}")

def create_users(db):
    """Create default users"""
    default_users = [
        {
            "email": "root@system.local",
            "name": "System Root",
            "password": "rootpass",
            "role": "Root",
        },
        {
            "email": "admin@school.edu",
            "name": "System Administrator",
            "password": "admin123",
            "role": "Admin",
        },
        {
            "email": "accountant@school.edu",
            "name": "Jane Accountant",
            "password": "accountant123",
            "role": "Accountant",
        },
        {
            "email": "teacher@school.edu",
            "name": "John Teacher",
            "password": "teacher123",
            "role": "Teacher",
        },
        {
            "email": "inventory@school.edu",
            "name": "Bob Inventory",
            "password": "inventory123",
            "role": "Inventory Manager",
        },
    ]
    
    for user_data in default_users:
        existing = db.users.find_one({"email": user_data["email"]})
        if not existing:
            user_data["created_at"] = datetime.utcnow()
            user_data["updated_at"] = datetime.utcnow()
            user_data["is_active"] = True
            db.users.insert_one(user_data)
            print(f"  OK - Created user: {user_data['name']} ({user_data['email']})")
        else:
            print(f"  - User already exists: {user_data['email']}")

def create_subjects(db):
    """Create subjects"""
    subjects = [
        {"subject_name": "Mathematics", "subject_code": "MATH101"},
        {"subject_name": "English", "subject_code": "ENG101"},
        {"subject_name": "Science", "subject_code": "SCI101"},
        {"subject_name": "Social Studies", "subject_code": "SS101"},
        {"subject_name": "Computer Science", "subject_code": "CS101"},
        {"subject_name": "Physics", "subject_code": "PHY201"},
        {"subject_name": "Chemistry", "subject_code": "CHEM201"},
        {"subject_name": "Biology", "subject_code": "BIO201"},
    ]
    
    for subject_data in subjects:
        existing = db.subjects.find_one({"subject_code": subject_data["subject_code"]})
        if not existing:
            subject_data["created_at"] = datetime.utcnow()
            subject_data["updated_at"] = datetime.utcnow()
            subject_data["assigned_class"] = None
            db.subjects.insert_one(subject_data)
            print(f"  OK - Created subject: {subject_data['subject_name']} ({subject_data['subject_code']})")
        else:
            print(f"  - Subject already exists: {subject_data['subject_code']}")

def create_branches(db):
    """Create a default school branch and ensure classes/students reference it."""
    default_branch = {"branch_code": "MAIN", "name": "Main Branch", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
    existing = db.branches.find_one({"branch_code": default_branch["branch_code"]})
    if not existing:
        db.branches.insert_one(default_branch)
        print("  ✓ Created branch: MAIN")
    else:
        print("  - Branch exists: MAIN")

    # Ensure existing classes have branch_code
    updated = db.classes.update_many({"branch_code": {"$exists": False}}, {"$set": {"branch_code": default_branch["branch_code"]}})
    if updated.modified_count:
        print(f"  ✓ Updated {updated.modified_count} classes with branch_code MAIN")

def create_classes(db):
    """Create classes with sections"""
    classes = [
        {"class_name": "Grade 1", "section": "A"},
        {"class_name": "Grade 1", "section": "B"},
        {"class_name": "Grade 2", "section": "A"},
        {"class_name": "Grade 3", "section": "A"},
        {"class_name": "Grade 4", "section": "A"},
        {"class_name": "Grade 5", "section": "A"},
    ]
    
    # Get all subjects for assignment
    all_subjects = list(db.subjects.find({}))
    subject_ids = [str(s["_id"]) for s in all_subjects]
    
    for class_data in classes:
        existing = db.classes.find_one({
            "class_name": class_data["class_name"],
            "section": class_data["section"]
        })
        if not existing:
            class_data["assigned_subjects"] = subject_ids[:5]  # Assign first 5 subjects
            class_data["assigned_teachers"] = []
            class_data["created_at"] = datetime.utcnow()
            class_data["updated_at"] = datetime.utcnow()
            db.classes.insert_one(class_data)
            print(f"  OK - Created class: {class_data['class_name']} - {class_data['section']}")
        else:
            print(f"  - Class already exists: {class_data['class_name']} - {class_data['section']}")

def create_students(db):
    """Create dummy students"""
    first_names = ["Ali", "Fatima", "Ahmed", "Ayesha", "Hassan", "Zainab", "Omar", "Mariam", 
                   "Ibrahim", "Khadija", "Yusuf", "Amina", "Abdullah", "Sarah", "Mohammad",
                   "Hira", "Bilal", "Noor", "Hamza", "Zara", "Usman", "Maryam", "Imran", "Laiba"]
    last_names = ["Khan", "Ali", "Ahmad", "Hassan", "Hussain", "Shah", "Ahmed", "Malik",
                  "Siddiqui", "Raza", "Abbas", "Haider", "Zaidi", "Jafri", "Rizvi"]
    
    # Get all classes
    all_classes = list(db.classes.find({}))
    
    # Get teacher user for assignment
    teacher_user = db.users.find_one({"role": "Teacher"})
    teacher_id = str(teacher_user["_id"]) if teacher_user else None
    
    student_count = 0
    current_year = datetime.now().year
    
    for i in range(25):  # Create 25 students
        # Generate unique student ID
        student_id = f"STU{current_year}{str(i+1).zfill(4)}"
        
        existing = db.students.find_one({"student_id": student_id})
        if existing:
            print(f"  - Student already exists: {student_id}")
            continue
        
        # Random student data
        first_name = random.choice(first_names)
        last_name = random.choice(last_names)
        full_name = f"{first_name} {last_name}"
        gender = random.choice(["Male", "Female"])
        
        # Random class assignment
        assigned_class = random.choice(all_classes)
        class_id = str(assigned_class["_id"])
        
        # Birth date (between 6-12 years old)
        age = random.randint(6, 12)
        birth_year = current_year - age
        dob = f"{birth_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
        
        # Admission date (within last 5 years)
        admission_year = random.randint(current_year - 5, current_year)
        admission_date = f"{admission_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
        
        student_data = {
            "student_id": student_id,
            "full_name": full_name,
            "gender": gender,
            "date_of_birth": dob,
            "admission_date": admission_date,
            "class_id": class_id,
            "section": assigned_class["section"],
            "roll_number": str(i + 1),
            "subjects": assigned_class.get("assigned_subjects", [])[:4],  # Assign 4 subjects
            "assigned_teacher_ids": [teacher_id] if teacher_id else [],
            "status": "active",
            "guardian_info": {
                "father_name": f"Mr. {last_name}",
                "mother_name": f"Mrs. {last_name}",
                "guardian_contact": f"+92-300-{random.randint(1000000, 9999999)}",
                "guardian_email": f"{first_name.lower()}.{last_name.lower()}@email.com",
                "address": f"House {random.randint(1, 999)}, Street {random.randint(1, 50)}, Lahore"
            },
            "contact_info": {
                "phone": f"+92-300-{random.randint(1000000, 9999999)}",
                "emergency_contact": f"+92-301-{random.randint(1000000, 9999999)}"
            },
            "academic_year": f"{current_year}-{current_year+1}",
            "branch_code": "MAIN",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        db.students.insert_one(student_data)
        student_count += 1
        
        if student_count % 5 == 0:
            print(f"  OK - Created {student_count} students...")
    
        print(f"  OK - Total students created: {student_count}")

def create_fees(db):
    """Create sample fees for students"""
    # Get all students
    all_students = list(db.students.find({}))
    
    # Get accountant user
    accountant = db.users.find_one({"role": "Accountant"})
    generated_by = str(accountant["_id"]) if accountant else None
    
    fee_types = ["Tuition Fee", "Library Fee", "Sports Fee", "Exam Fee", "Lab Fee"]
    fee_count = 0
    
    # Generate fees for first 15 students
    for student in all_students[:15]:
        # Generate 2-3 random fees per student
        num_fees = random.randint(2, 3)
        
        for _ in range(num_fees):
            fee_type = random.choice(fee_types)
            
            # Check if this fee already exists
            existing = db.fees.find_one({
                "student_id": student["student_id"],
                "fee_type": fee_type
            })
            
            if existing:
                continue
            
            amount = random.choice([5000, 7500, 10000, 12000, 15000])
            status = random.choice(["pending", "paid", "pending", "paid"])  # More pending
            
            # Due date in next 30 days for pending, random past for paid
            if status == "pending":
                days_ahead = random.randint(5, 30)
                due_date = (datetime.utcnow() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                paid_at = None
            else:
                days_ago = random.randint(1, 60)
                due_date = (datetime.utcnow() - timedelta(days=days_ago+10)).strftime("%Y-%m-%d")
                paid_at = datetime.utcnow() - timedelta(days=days_ago)
            
            fee_data = {
                "student_id": student["student_id"],
                "class_id": student["class_id"],
                "fee_type": fee_type,
                "amount": amount,
                "due_date": due_date,
                "status": status,
                "generated_by": generated_by,
                "created_at": datetime.utcnow(),
                "paid_at": paid_at,
                "payment_method": "Cash" if paid_at else None,
                "remarks": None
            }
            
            db.fees.insert_one(fee_data)
            fee_count += 1
    
    print(f"  OK - Created {fee_count} fee records")

def display_summary(db):
    """Display summary of database contents"""
    print("\n" + "-"*70)
    print("DATABASE SUMMARY")
    print("-"*70)
    
    users_count = db.users.count_documents({})
    roles_count = db.roles.count_documents({})
    students_count = db.students.count_documents({})
    classes_count = db.classes.count_documents({})
    subjects_count = db.subjects.count_documents({})
    fees_count = db.fees.count_documents({})
    fees_pending = db.fees.count_documents({"status": "pending"})
    fees_paid = db.fees.count_documents({"status": "paid"})
    
    print(f"  Users: {users_count}")
    print(f"  Roles: {roles_count}")
    print(f"  Students: {students_count}")
    print(f"  Classes: {classes_count}")
    print(f"  Subjects: {subjects_count}")
    print(f"  Fees Total: {fees_count} (Pending: {fees_pending}, Paid: {fees_paid})")
    print("-"*70)
    
    print("\nTEST ACCOUNTS:")
    print("-"*70)
    for user in db.users.find({}):
        print(f"  Email: {user['email']}")
        print(f"  Password: {user['password']}")
        print(f"  Role: {user['role']}")
        print("-"*70)
    
    print("\nYou can now:")
    print("  1. Run: python main.py (start backend)")
    print("  2. Run: npm run dev (start frontend)")
    print("  3. Login with any test account above")
    print()

if __name__ == "__main__":
    try:
        setup_database()
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
