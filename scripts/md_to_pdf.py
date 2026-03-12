#!/usr/bin/env python3
"""Simple markdown to PDF converter for concise report.
Uses ReportLab to render plain text lines with basic wrapping.
"""
import textwrap
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import sys


def md_to_lines(md_text, width_chars=100):
    lines = []
    for raw in md_text.splitlines():
        stripped = raw.strip()
        if not stripped:
            lines.append('')
            continue
        # Remove leading markdown bullets and hashes
        if stripped.startswith('#'):
            stripped = stripped.lstrip('#').strip()
        if stripped.startswith('- '):
            stripped = '• ' + stripped[2:]
        wrapped = textwrap.wrap(stripped, width=width_chars)
        if not wrapped:
            lines.append('')
        else:
            lines.extend(wrapped)
    return lines


def render_pdf(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        md = f.read()

    pagesize = A4
    c = canvas.Canvas(pdf_path, pagesize=pagesize)
    width, height = pagesize

    left = 20 * mm
    top = height - 20 * mm
    y = top
    line_height = 9  # points
    max_lines_per_page = int((top - 20*mm) / line_height)

    lines = md_to_lines(md, width_chars=95)

    for i, line in enumerate(lines):
        if y < 25 * mm:
            c.showPage()
            y = top
        c.setFont('Helvetica', 10)
        c.drawString(left, y, line)
        y -= line_height

    c.save()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: md_to_pdf.py input.md output.pdf')
        sys.exit(1)
    md_path = sys.argv[1]
    pdf_path = sys.argv[2]
    render_pdf(md_path, pdf_path)
    print('PDF generated:', pdf_path)
