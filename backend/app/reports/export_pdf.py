"""
PDF export for the reports-for-analysis module (reportlab / Platypus).

Renders the SAME sections as export_xlsx.py (junior_report_sections /
programme_report_sections) into a branded, print-ready PDF, returned
base64-encoded as {filename, mime, content_base64} — the coach_analytics
export envelope.
"""

import base64
import os
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
    TableStyle,
)

from app.coach_analytics.export import _slug
from app.reports.export_xlsx import (
    _blank, _period, _window_tag,
    junior_report_sections, programme_report_sections,
)

PDF_MIME = "application/pdf"

_NAVY = colors.HexColor("#012349")
_AZURE = colors.HexColor("#0082cd")
_GOLD = colors.HexColor("#fbbf24")
_GRID = colors.HexColor("#B8C4CF")
_ZEBRA = colors.HexColor("#F2F5F8")
_MUTED = colors.HexColor("#5A6672")

_MARGIN = 15 * mm
_BAND_H = 16 * mm
_CLUB_NAME = "Karen Country Club — Junior Golf Academy"

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "kcc-logo.png")
_LOGO = ImageReader(_LOGO_PATH) if os.path.exists(_LOGO_PATH) else None
_LOGO_H = 10 * mm
_LOGO_W = _LOGO_H  # source is a square 512x512 mark

_TITLE = ParagraphStyle(
    "kcc-title", fontName="Helvetica-Bold", fontSize=19, leading=23,
    textColor=_NAVY,
)
_SUBTITLE = ParagraphStyle(
    "kcc-subtitle", fontName="Helvetica", fontSize=10, leading=13,
    textColor=_MUTED,
)
_EYEBROW = ParagraphStyle(
    "kcc-eyebrow", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
    textColor=_AZURE,
)
_CELL = ParagraphStyle(
    "kcc-cell", fontName="Helvetica", fontSize=9, leading=11.5,
)
_CELL_LABEL = ParagraphStyle(
    "kcc-cell-label", parent=_CELL, fontName="Helvetica-Bold", textColor=_NAVY,
)
_CELL_HEAD = ParagraphStyle(
    "kcc-cell-head", parent=_CELL, fontName="Helvetica-Bold",
    textColor=colors.white,
)

_TABLE_BASE = [
    ("GRID", (0, 0), (-1, -1), 0.4, _GRID),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]

_WIDE_COLUMNS = {"event", "recommendation", "assessment"}


class _NumberedCanvas(canvas.Canvas):
    # "Page X of Y" needs the total page count, which is only known once the
    # whole story has flowed — buffer each page's state and stamp on save().
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_states = []

    def showPage(self):
        self._saved_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_states)
        for state in self._saved_states:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total):
        w, h = self._pagesize
        self.saveState()
        self.setFillColor(_NAVY)
        self.rect(0, h - _BAND_H, w, _BAND_H, stroke=0, fill=1)
        self.setFillColor(_GOLD)
        self.rect(0, h - _BAND_H, w, 1 * mm, stroke=0, fill=1)

        text_x = _MARGIN
        if _LOGO is not None:
            logo_y = h - (_BAND_H + _LOGO_H) / 2
            self.drawImage(
                _LOGO, _MARGIN, logo_y, width=_LOGO_W, height=_LOGO_H,
                mask="auto", preserveAspectRatio=True,
            )
            text_x = _MARGIN + _LOGO_W + 3 * mm

        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 11)
        self.drawString(text_x, h - 9.5 * mm, _CLUB_NAME)
        self.setFillColor(_MUTED)
        self.setFont("Helvetica", 7.5)
        self.drawString(
            _MARGIN, 10 * mm,
            f"Generated {date.today():%d %b %Y} · {_CLUB_NAME}"
            " · Confidential — club use only",
        )
        self.drawRightString(w - _MARGIN, 10 * mm, f"Page {self._pageNumber} of {total}")
        self.restoreState()


def _cell(value, style=_CELL):
    return Paragraph(escape(str(_blank(value))), style)


def _col_widths(headers, avail):
    weights = [1.8 if h.lower() in _WIDE_COLUMNS else 1.0 for h in headers]
    total = sum(weights)
    return [avail * w / total for w in weights]


def _section_table(headers, rows, avail):
    style = list(_TABLE_BASE)
    if headers is None:
        data = [[_cell(label, _CELL_LABEL), _cell(value)] for label, value in rows]
        widths = [avail * 0.5, avail * 0.5]
        repeat = 0
        style.append(("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, _ZEBRA]))
    else:
        data = [[_cell(h, _CELL_HEAD) for h in headers]]
        data += [[_cell(v) for v in row] for row in rows]
        widths = _col_widths(headers, avail)
        repeat = 1
        style.append(("BACKGROUND", (0, 0), (-1, 0), _NAVY))
        if rows:
            style.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ZEBRA]))
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=repeat)
    table.setStyle(TableStyle(style))
    return table


def _sections_pdf(title, period, sections):
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=_MARGIN, rightMargin=_MARGIN,
        topMargin=_BAND_H + 8 * mm, bottomMargin=18 * mm,
        title=title, author="Karen Country Club",
    )
    avail = A4[0] - 2 * _MARGIN
    story = [
        Paragraph(escape(title), _TITLE),
        Spacer(1, 1.5 * mm),
        Paragraph(escape(period), _SUBTITLE),
        Spacer(1, 3 * mm),
        HRFlowable(width="100%", thickness=1, color=_GOLD, spaceAfter=6 * mm),
    ]
    for name, headers, rows in sections:
        # KeepTogether stops a section heading being orphaned at a page
        # bottom; content taller than a page still splits normally.
        story.append(KeepTogether([
            Paragraph(escape(name.upper()), _EYEBROW),
            Spacer(1, 2 * mm),
            _section_table(headers, rows, avail),
        ]))
        story.append(Spacer(1, 6 * mm))
    doc.build(story, canvasmaker=_NumberedCanvas)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def build_junior_pdf(report):
    window = report["window"]
    name = report["junior"]["full_name"]
    content = _sections_pdf(
        f"Junior report — {name}", _period(window), junior_report_sections(report)
    )
    filename = f"junior-report-{_slug(name)}_{_window_tag(window)}.pdf"
    return {"filename": filename, "mime": PDF_MIME, "content_base64": content}


def build_programme_pdf(report):
    window = report["window"]
    content = _sections_pdf(
        "Junior programme report", _period(window), programme_report_sections(report)
    )
    filename = f"programme-report_{_window_tag(window)}.pdf"
    return {"filename": filename, "mime": PDF_MIME, "content_base64": content}
