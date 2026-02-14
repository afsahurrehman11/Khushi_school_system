import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database import get_db
from datetime import datetime

approved_permissions = [
    "system.manage_access",
    "students.read", "students.write",
    "teachers.read", "teachers.write",
    "academics.assign_subjects", "academics.view_classes",
    "fees.manage", "fees.view", "accounting.dashboard_view",
    "inventory.manage", "inventory.view", "sales.manage",
    "reports.view"
]

role_permissions = {
    "Admin": approved_permissions,
    "Accountant": ["students.read", "fees.manage", "fees.view", "accounting.dashboard_view", "reports.view"],
    "Teacher": ["students.read", "academics.view_classes", "academics.assign_subjects"],
    "Inventory Manager": ["inventory.manage", "inventory.view", "sales.manage"],
    "Root": ["system.view_overview"]
}

if __name__ == '__main__':
    db = get_db()
    for role_name, perms in role_permissions.items():
        res = db.roles.update_one({"name": role_name}, {"$set": {"permissions": perms, "updated_at": datetime.utcnow()}})
        if res.matched_count:
            print(f"Updated role {role_name} with {len(perms)} permissions")
        else:
            print(f"Role {role_name} not found")
