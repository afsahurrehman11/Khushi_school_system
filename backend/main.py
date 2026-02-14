#!/usr/bin/env python3
"""
Khushi ERP System Backend
FastAPI application entry point
"""

import uvicorn
import os
from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Disable reload for production
        log_level="info"
    )