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
    if not os.environ.get("PORT"):  # Only for local dev, find free port
        import socket
        def find_free_port(start_port=8000):
            port = start_port
            while True:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    try:
                        s.bind(('', port))
                        return port
                    except OSError:
                        port += 1
        port = find_free_port(port)
    print(f"🚀 Starting server on port {port}")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Disable reload for production
        log_level=os.environ.get("LOG_LEVEL", "info"),
        access_log=os.environ.get("LOG_ACCESS", "true").lower() in ("1", "true", "yes")
    )