## Role Change Feature - Summary

### What's New
Users can now edit a person's role from **student to teacher** or **teacher to student** directly from the Dashboard's Edit modal.

### How It Works

**Frontend (Dashboard.jsx):**
- Added role dropdown selector in the edit modal
- Conditional hourly_rate input field (only visible for teachers)
- Role state management: `editRole` and `editHourlyRate` 
- Submit handler now includes role and hourly_rate in form data

**Backend (app.py):**
- Updated `/persons/{student_id}` PUT endpoint to accept `role` and `hourly_rate` parameters
- Validates role is either 'student' or 'teacher'
- When changing to teacher: auto-sets hourly_rate (default $15/hour)
- When setting hourly_rate: validates person is a teacher
- Persists changes to registry.json

### Testing
✅ Student to Teacher: ID 2 changed from "Second" student → "Second Teacher" with $20/hr rate
✅ Teacher to Student: ID 3 changed to student role
✅ Data persisted in registry.json
✅ Frontend auto-detects backend on ports 8000-8010

### Usage
1. Go to **Dashboard** tab
2. Click **Edit** on any person
3. Change role from dropdown (Student/Teacher)
4. If Teacher: set hourly rate (USD)
5. Click **Save**
6. Attendance and payroll will automatically update based on new role

### Files Modified
- `frontend/src/components/Dashboard.jsx` - Added role selector and hourly_rate input
- `backend/app.py` - Updated PUT `/persons/{student_id}` endpoint
