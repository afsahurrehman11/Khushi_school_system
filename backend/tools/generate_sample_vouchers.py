"""
Utility to generate sample fee voucher PDFs for quick local verification.
Run from repository root with the virtualenv active.

Examples:
    python backend/tools/generate_sample_vouchers.py --student <student_id> --school <school_id>
    python backend/tools/generate_sample_vouchers.py --class <class_id> --school <school_id> --out-dir out

The script writes PDF files to the current directory or to --out-dir.
"""
import argparse
import os
import sys
from pathlib import Path

# Ensure repo root on sys.path to import application modules
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.fee_voucher_service import (
    generate_student_fee_voucher_with_photo,
    generate_class_vouchers_combined_pdf,
)


def write_bytes(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def main():
    parser = argparse.ArgumentParser(description="Generate sample fee voucher PDFs")
    parser.add_argument('--student', help='Student ObjectId string to generate a single voucher')
    parser.add_argument('--class', dest='class_id', help='Class id to generate combined PDF for all students')
    parser.add_argument('--school', required=True, help='School id for isolation (required)')
    parser.add_argument('--out-dir', default='.', help='Output directory')

    args = parser.parse_args()

    out = Path(args.out_dir)

    if args.student:
        print(f"Generating single voucher for student {args.student} (school {args.school})")
        pdf = generate_student_fee_voucher_with_photo(args.student, args.school)
        out_path = out / f"voucher_student_{args.student}.pdf"
        write_bytes(out_path, pdf)
        print(f"Wrote: {out_path}")

    if args.class_id:
        print(f"Generating combined class vouchers for class {args.class_id} (school {args.school})")
        pdf = generate_class_vouchers_combined_pdf(args.class_id, args.school)
        out_path = out / f"vouchers_class_{args.class_id}.pdf"
        write_bytes(out_path, pdf)
        print(f"Wrote: {out_path}")

    if not args.student and not args.class_id:
        parser.print_help()


if __name__ == '__main__':
    main()
