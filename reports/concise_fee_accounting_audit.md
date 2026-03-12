Student Fee Payment & Accounting System — Detailed Concise Audit

Purpose: clear, specific summary of how the fee and accounting flows work today, exact problem locations, and precise recommended fixes. No jargon.

1. Overview
- Backend: `backend/app` (FastAPI). Frontend: `frontend/src` (React + TypeScript). Database: MongoDB, one database per school.

2. How multi-tenant databases are chosen (exact)
- JWT includes `database_name`, `school_id`, `school_slug` (see [backend/app/middleware/database_routing.py](backend/app/middleware/database_routing.py)).
- Request middleware sets ContextVars: `current_school_db`, `current_school_id`, `current_school_slug`.
- `get_db_for_request()` uses `current_school_db` to call `get_school_database(db_name)` (per-tenant DB). Root users fall back to default DB.
- Mongo client is single `MongoClient` in [backend/app/database.py](backend/app/database.py) with pooling; databases are selected as `client[db_name]`.

3. Fee categories and assignment (exact)
- Collection: `fee_categories` (file: [backend/app/models/fee_category.py](backend/app/models/fee_category.py)). Each document has `components` array with items `{component_name, amount}`.
- Class assignment lives in `class_fee_assignments` collection; documents contain `class_id` and `category_id`.
- Student base fee is computed by code in `get_student_base_fee()` ([backend/app/services/student_fee_service.py]) by reading student's `class_id`, finding `class_fee_assignments`, then summing `components` from the linked `fee_categories` document.

4. Monthly fee records (exact)
- Collection name: `student_monthly_fees`.
- Key stored fields: `student_id`, `month` (1-12), `year`, `base_fee`, `scholarship_percent`, `scholarship_amount`, `fee_after_discount`, `arrears_added`, `final_fee`, `amount_paid`, `remaining_amount`, `status`, `generated_by`, `created_at`, `updated_at`.
- Status values: `PAID`, `PARTIAL`, `UNPAID`, `OVERDUE` (see model in [backend/app/models/student_monthly_fee.py](backend/app/models/student_monthly_fee.py)).
- Generation: `generate_monthly_fee(student_id, school_id, month, year, generated_by)` in [backend/app/services/student_fee_service.py]. If current month record missing, `GET /api/student-fees/monthly/{student_id}/current` auto-generates.

5. Payment recording flow (detailed)
- Frontend: `frontend/src/features/students/components/RecordPaymentTab.tsx` collects: amount, payment method, method name (optional), transaction reference.
- Frontend calls `studentFees.createPayment()` in `frontend/src/services/studentFees.ts`, which `POST`s to `/api/student-fees/payments/{student_id}` with body `{monthly_fee_id, amount, payment_method, transaction_reference, notes}`.
- Router: `POST /api/student-fees/payments/{student_id}` implemented in [backend/app/routers/student_monthly_fees.py].
- Service: `create_payment()` in [backend/app/services/student_fee_service.py] performs:
	- Validate monthly fee exists and amount ≤ remaining_amount
	- Insert payment document into `student_payments` with fields including `payment_date` and `received_by` (value passed from router)
	- Update `student_monthly_fees`: `amount_paid`, `remaining_amount`, `status`
	- Recompute student's arrears with `compute_student_arrears_balance()` and save into student record

6. Exact error: `received_by` undefined
- File: [backend/app/routers/student_monthly_fees.py]
- Function: `record_payment()`
- Problem code (approx):
	```py
	user_id = current_user.get('sub')
	payment = create_payment(..., received_by=received_by)
	```
	`received_by` is never defined in this function, causing a `NameError` and 500 error.
- Fix (precise): replace `received_by=received_by` with `received_by=current_user.get('id') or current_user.get('sub')` or set `received_by = current_user.get('id')` before calling `create_payment()`.

7. Roles and permissions (exact)
- Users and roles live in `saas_root_db.global_users` (see startup and auth code in `backend/app/startup.py` and `backend/app/dependencies/auth.py`).
- Current code sets `RBAC_DISABLED = True` in `backend/app/dependencies/auth.py`, so backend does not reject unauthorized actions. Frontend additionally blocks non-accountant/non-admin users in `RecordPaymentTab.tsx`.
- Recommendation: enable RBAC (set `RBAC_DISABLED = False`) and implement permission checks in `check_permission()` before production.

8. Accountant session logic (exact)
- Collections: `cash_sessions` and `cash_transactions` (models in `backend/app/models/cash_session.py` and logic in `backend/app/services/cash_session_service.py`).
- Sessions are created by `get_or_create_session(user_id, school_id)` as `inactive`, then activated via `POST /api/cash-sessions/current/activate` in `backend/app/routers/cash_sessions.py`.
- Current problem: `create_payment()` does NOT verify an active session nor automatically call `record_transaction()` to add a `cash_transactions` entry and update session balances. The frontend checks session active state but the backend should also validate.

9. Payment methods and metadata (exact)
- `payment_methods` collection exists; methods have `name` and `normalized` fields (see `backend/app/services/payment_method_service.py`).
- Currently the frontend stores a non-cash `methodName` in the `notes` field (unstructured). Payment records do not reference `payment_methods` by id.
- Recommendation: add `payment_method_id` to `student_payments` and store structured metadata: `{method_id, method_name}`.

10. Student data in payments (exact)
- Current: `student_payments` stores `student_id` only. No snapshot of student name, class, or admission number.
- Risk: if student data changes, historical payments lose context. Also each payment view requires additional queries to `students` and `classes`.
- Recommendation: store `student_snapshot` in `student_payments` at time of payment with `name`, `class_id`, `class_name`, `admission_number`.

11. Accounting features present vs missing (concise)
- Present: cash sessions, daily summary endpoints, accountant profiles, basic transaction logging structures.
- Missing or incomplete: backend-enforced session validation on payments, automatic session transaction recording when payment is created, consistent audit logs (who recorded or edited payments), structured payment method linkage, receipt generation.

12. Collections list (exact)
- Payments and fees: `student_monthly_fees`, `student_payments`, `class_fee_assignments`, `fee_categories`, `chalans` (partial).
- Accounting: `cash_sessions`, `cash_transactions`, `accountant_profiles`, `accountant_daily_summaries`, `accountant_transactions`.
- Users and tenancy: `global_users` (saas root DB), `schools` (saas root), per-school `students`, `users`, `classes`, `payment_methods`.

13. Performance and quick fixes
- Ensure indexes present by running `backend/tools/create_indexes.py` (it lists indexes for `student_monthly_fees`, `student_payments`, and `fee_payments`).
- Avoid N+1 lookups by using MongoDB `$lookup` aggregations when showing payment lists with student info, or denormalize snapshots into payments.
- Cache repeated fee category reads for class lists (server-side cache exists in `student_fee_service` but consider Redis for scale).

14. Immediate action items (specific code edits)
1. Edit `backend/app/routers/student_monthly_fees.py` in `record_payment()` to set `received_by = current_user.get('id') or current_user.get('sub')` and pass it to `create_payment()`.
2. In `backend/app/services/student_fee_service.py` inside `create_payment()` call `get_or_create_session(received_by, school_id)` and then `record_transaction(session_id, received_by, school_id, payment_id, student_id, amount, payment_method, transaction_reference)` to update `cash_sessions`.
3. Add `payment_method_id` in the payment API and populate from `payment_methods` collection when frontend supplies `methodName`.
4. Add `student_snapshot` to `student_payments` at insertion time.

Report saved as `reports/concise_fee_accounting_audit.md` and exported to PDF `reports/concise_fee_accounting_audit.pdf`.
