from .auth import router as auth
from .users import router as users
from .students import router as students
from .fees import router as fees
from .classes import router as classes
from .teachers import router as teachers
from .grades import router as grades
from .accounting import router as accounting
from .payments import router as payments
from .reports import router as reports
from .root import router as root
from .student_import_export import router as student_import_export
from .chalans import router as chalans
from .fee_categories import router as fee_categories
from .class_fee_assignments import router as class_fee_assignments
from .notifications import router as notifications
from .fee_payments import router as fee_payments
from .accountant import router as accountant
from .payment_methods import router as payment_methods

__all__ = ["auth", "users", "students", "fees", "classes", "teachers", "grades", "accounting", "payments", "reports", "root", "student_import_export", "chalans", "fee_categories", "class_fee_assignments", "notifications", "fee_payments", "accountant", "payment_methods"]
