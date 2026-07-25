from app.attendance.models import Attendance, AttendanceStatus
from app.database.database import db
from app.utils.schemas import SimpleModelSchema

attendance_schema = SimpleModelSchema(Attendance)
attendances_schema = SimpleModelSchema(Attendance, many=True)


def list_attendance(session_id=None, junior_id=None, coach_id=None):
    q = Attendance.query
    if session_id:
        q = q.filter_by(session_id=session_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if coach_id is not None:
        # Coach roster scoping: only attendance for juniors assigned to this
        # coach (no exceptions). Joins through the linked JuniorProfile.
        from app.juniors.models import JuniorProfile
        q = q.join(JuniorProfile, Attendance.junior_id == JuniorProfile.id).filter(
            JuniorProfile.coach_id == coach_id
        )
    return q.all()


def get_attendance(attendance_id: int):
    return db.session.get(Attendance, attendance_id)


def create_attendance(data: dict):
    a = attendance_schema.load(data)
    db.session.add(a)
    db.session.commit()
    return a


def update_attendance(a, data: dict):
    for k, v in data.items():
        setattr(a, k, v)
    db.session.commit()
    return a


def delete_attendance(a):
    db.session.delete(a)
    db.session.commit()


def bulk_mark_attendance(session_id: int, records: list):
    """
    records: [{"junior_id": int, "status": "present"|"absent"|"excused"}, ...]
    Upserts attendance for each junior in the session.
    Returns list of Attendance objects.
    """
    results = []
    for rec in records:
        junior_id = rec.get("junior_id")
        status = rec.get("status", "present")
        existing = Attendance.query.filter_by(session_id=session_id, junior_id=junior_id).first()
        if existing:
            existing.status = status
            results.append(existing)
        else:
            a = Attendance(session_id=session_id, junior_id=junior_id, status=status)
            db.session.add(a)
            results.append(a)
    db.session.commit()
    return results


def get_session_summary(session_id: int):
    rows = Attendance.query.filter_by(session_id=session_id).all()
    return {
        "session_id": session_id,
        "present": sum(1 for r in rows if r.status == AttendanceStatus.present),
        "absent": sum(1 for r in rows if r.status == AttendanceStatus.absent),
        "excused": sum(1 for r in rows if r.status == AttendanceStatus.excused),
        "total": len(rows),
        "records": attendances_schema.dump(rows),
    }


def summarize_attendance(junior_id: int, date_from=None, date_to=None):
    """Present/absent/excused/total counts (+ rate) for one junior, optionally
    windowed by date (date objects).

    A row's date comes from its coaching Session OR its Junior League fixture
    (league rows have session_id NULL). Without a window every row counts;
    with one, rows whose source carries no date are excluded (they can't be
    placed in the window).
    """
    rows = Attendance.query.filter_by(junior_id=junior_id).all()
    if date_from is not None or date_to is not None:
        kept = []
        for a in rows:
            if a.session_id is not None:
                d = a.session.date if a.session else None
            else:
                d = a.league_fixture.date if a.league_fixture else None
            if d is None:
                continue
            if date_from is not None and d < date_from:
                continue
            if date_to is not None and d > date_to:
                continue
            kept.append(a)
        rows = kept
    present = sum(1 for r in rows if r.status == AttendanceStatus.present)
    total = len(rows)
    return {
        "present": present,
        "absent": sum(1 for r in rows if r.status == AttendanceStatus.absent),
        "excused": sum(1 for r in rows if r.status == AttendanceStatus.excused),
        "total": total,
        "rate": round(present / total, 3) if total else None,
    }
