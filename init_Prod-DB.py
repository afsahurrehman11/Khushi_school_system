from pymongo import MongoClient
from datetime import datetime
from urllib.parse import quote_plus

# ---------- CONFIG ----------
raw_user = "root"
raw_password = "khushi-root-DB-@*007"  # your original password
encoded_user = quote_plus(raw_user)
encoded_password = quote_plus(raw_password)
MONGO_URI = f"mongodb+srv://{encoded_user}:{encoded_password}@cluster0.zml92km.mongodb.net/"

ROOT_EMAIL = "root@edu"
ROOT_PASSWORD = "111"  # Set a secure password
# ----------------------------

def create_saas_root_db(uri):
    client = MongoClient(uri)
    
    # Create the main root database
    db = client["saas_root_db"]
    
    # Collections
    collections = ["global_users", "payment_records", "schools", "usage_snapshots"]
    for col in collections:
        if col not in db.list_collection_names():
            db.create_collection(col)
            print(f"✅ Collection created: {col}")
        else:
            print(f"ℹ️ Collection already exists: {col}")

    # Add root user if not exists
    users_col = db["global_users"]
    if users_col.find_one({"email": ROOT_EMAIL}):
        print("ℹ️ Root user already exists")
    else:
        root_user = {
            "email": ROOT_EMAIL,
            "password": ROOT_PASSWORD,  # In production, hash this properly
            "role": "root",
            "created_at": datetime.utcnow(),
            "is_active": True
        }
        users_col.insert_one(root_user)
        print("✅ Root user created:", ROOT_EMAIL)

    print("\n✅ SaaS root database initialized successfully!")

if __name__ == "__main__":
    create_saas_root_db(MONGO_URI)