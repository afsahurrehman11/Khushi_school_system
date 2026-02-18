# Facial Recognition Identity Module (Recognition-Only)

## Objective & Overview
* **Project Title:** Facial Recognition Identity Module
* **Goal:** Provide a compact identity service that recognizes faces from a pre-trained group (one image per person). 
* **Platform:** Works on desktop and mobile (PWA frontend). 
* **Responsibility split:** This module only recognizes identities; the CMS handles enrollment, attendance logic, and user metadata.

---

## Technologies (Tech Stack)

### Frontend
* **Framework:** React (PWA) — capture a single frame and send it to the recognition endpoint.
* **Face Detection:** MediaPipe (client-side) for stabilization and bounding-box feedback; fallback to manual image upload when unavailable.
* **Core Components:** HTML5 Video + Canvas for capture, minimal UI for consent and status.

### Backend
* **Framework:** Python (FastAPI)
* **Model:** FaceNet (or compatible embedding model) — offline embeddings are precomputed from one image per person and loaded at service start.
* **Logic:** Compute embedding for incoming frame, compare with the preloaded embeddings (cosine distance), return matched `studentID`/`employeeID` and confidence.
* **Libraries:** NumPy, OpenCV, optionally GPU inference backends.

### Storage
* **Format:** File system using JSON + NumPy files. The CMS provides a dataset package (JSON metadata + one canonical image per person) which this module converts into embeddings at startup.
* **Data Structure:**
    * **Registry:** JSON list mapping `studentID`/`employeeID` → metadata (name, ID, image filename).
    * **Embeddings:** `.npy` file or in-memory array created from the provided images. No dynamic enrollment in this module.
* **Backup/Restore:** import/export ZIP of the registry + images for portability.

---

## Features

### Recognition Functionality
* **Live face rectangle feedback:** Client stabilizes the face locally and shows feedback; when stable a single frame is sent for recognition.
* **Operations:** The service returns the matched `studentID`/`employeeID` and confidence; the CMS handles check-in/check-out and recording.
* **Feedback:** The PWA displays success / unknown / low-confidence messages and returns the identity payload to the CMS adapter.

### Enrollment (Options)
* Primary mode: the CMS handles enrollment and provides a ZIP (registry JSON + images) to import.
* Optional: the module also includes a simple enrollment UI and API to register one image per person directly (`POST /enroll`). This is useful for small deployments or when the CMS cannot perform enrollment.
* Supported import/export endpoints: `POST /import-zip`, `GET /export-zip` for dataset portability and backups.

---

## User Stories & Workflows

### Frontend Flow
1.  Basic user instructions to adjust the face of the user for face detection 
2.  Face detector will activate and stabilize the face 
3.  Once the face is stabilized, we will send a single frame to the backend 

### Backend Flow (recognize-only)
1. Receive captured image (single frame) from PWA or CMS adapter.
2. Generate FaceNet embedding for the provided frame.
3. Compare with preloaded embeddings (cosine distance) and pick best match over threshold.
4. Return `{ studentID | employeeID, name, confidence }` to the caller. Attendance and recordkeeping remain on the CMS side.

### Enrollment Flow
1.  Receive uploaded image 
2.  Generate embedding 
3.  Save metadata and embedding in files 

---

## Dataset Import & Backup
* The module accepts a ZIP package (registry JSON + one image per person). The import endpoint unpacks, validates, and precomputes embeddings.
* To recover or move, re-upload the ZIP to the import endpoint — CMS retains the canonical dataset and attendance records.
* Optional: periodic snapshot of the loaded embeddings and registry can be exported as a ZIP for offline backup.

---

## Implementation Summary (recognize-only)
* Frontend: React PWA (demo included) that stabilizes face, captures one frame, and calls `POST /recognize` with an image. A registration UI is provided at `frontend/index.html` which calls `POST /enroll`.
* Backend: FastAPI service (demo scaffold included) with endpoints:
  - `POST /recognize` — accepts an image, returns matched ID + confidence.
  - `POST /enroll` — enroll a single canonical image per student/employee.
  - `POST /import-zip` — accepts ZIP with registry JSON + images and precomputes embeddings.
  - `GET /export-zip` — download current registry + images.
* Storage: in-service registry JSON + `.npy` embeddings; enrollment updates the registry and embeddings.
* Integration: CMS calls `POST /recognize` and uses returned ID to update attendance and other workflows; for small sites the module can be used standalone to enroll and recognize.

---

If you want, I can now:
- scaffold the smaller FastAPI service (endpoints + import loader), or
- create the PWA capture page that sends a single frame to `POST /recognize`, or
- produce a one-page integration adapter example for the CMS.

Choose which I should start implementing first.