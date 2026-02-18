# Face Identity Module (backend)

Run the demo backend (development):

1. Create a virtualenv and install requirements:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
```

2. Run the app:

```powershell
python backend/app.py
```

Environment variables
- `API_KEY` (optional): when set, endpoints require `x-api-key` header with this value for protected endpoints.
- `FACE_MATCH_THRESHOLD` (optional): float (default 0.6) to tune match acceptance threshold.

The service exposes:
- `POST /enroll` : multipart form `name`, `student_id`, `file` to enroll one image per person. Protected when `API_KEY` is set.
- `POST /recognize` : multipart `file` to recognize a person. Protected when `API_KEY` is set.
- `POST /import-zip` : upload a ZIP with `registry.json` and `images/` to bulk import. Protected when `API_KEY` is set.
- `GET /export-zip` : download ZIP of current registry + images.
- `GET /health` : basic health and model info.

Notes:
- The backend will use `facenet-pytorch` if installed and will run on CPU or GPU depending on your environment. If not available it falls back to a lightweight demo embedding.
- For production, install `torch` and `facenet-pytorch` (GPU packages if you have CUDA-enabled GPUs) and tune thresholds and security (auth, TLS).

