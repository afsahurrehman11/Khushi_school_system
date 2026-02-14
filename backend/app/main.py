from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.config import settings
from app.database import get_db
from app.routers import auth, users, students, fees, classes, teachers, grades, accounting, payments, reports, root, student_import_export, chalans, fee_categories, class_fee_assignments, notifications, fee_payments, accountant, payment_methods

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Khushi ERP System API",
    description="School Enterprise Resource Planning System",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth, prefix="/api", tags=["Authentication"])
app.include_router(users, prefix="/api/admin", tags=["User Management"])
app.include_router(students, prefix="/api", tags=["Students"])
app.include_router(fees, prefix="/api", tags=["Fees"])
app.include_router(classes, prefix="/api", tags=["Classes & Subjects"])
app.include_router(teachers, prefix="/api", tags=["Teachers"])
app.include_router(grades, prefix="/api", tags=["Grades"])
app.include_router(accounting, prefix="/api", tags=["Accounting"])
app.include_router(payments, tags=["Payments"])
app.include_router(reports, prefix="/api", tags=["Reports"])
app.include_router(root, prefix="/api/root", tags=["Root"])
app.include_router(student_import_export, prefix="/api/students-import-export", tags=["Student Import/Export"])
app.include_router(chalans, tags=["Chalans"])
app.include_router(fee_categories, tags=["Fee Categories"])
app.include_router(class_fee_assignments, tags=["Class Fee Assignments"])
app.include_router(notifications, prefix="/api", tags=["Notifications"])
app.include_router(fee_payments, tags=["Fee Payments"])
app.include_router(accountant, tags=["Accountants"])
app.include_router(payment_methods, tags=["Payment Methods"])

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    logger.info("🚀 Starting Khushi ERP System API")
    try:
        db = get_db()
        # Test database connection
        db.command("ping")
        logger.info("✅ Database connection established")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        raise

    logger.info("✅ All routers registered successfully")
    logger.info(f"📡 API running on configured origins: {settings.allowed_origins}")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("🛑 Shutting down Khushi ERP System API")

@app.get("/")
async def root():
    """Root endpoint"""
    logger.info("📄 Root endpoint accessed")
    return {"message": "Khushi ERP System API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        db = get_db()
        # Test database connection
        db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}
