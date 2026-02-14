# CMS Backend

FastAPI backend for the CMS system.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set environment variables in `.env`:
   ```
   MONGO_URI=your_mongodb_connection_string
   ```

3. Run locally:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Deployment

Deployed on Render with:
- Root Directory: backend
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port 10000`