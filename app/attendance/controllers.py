from app.attendance.models import Attendance, AttendanceStatus
from app.database.database import db
from app.utils.schemas import SimpleModelSchema

attendance_schema = SimpleModelSchema(Attendance)
attendances_schema = SimpleModelSchema(Attendance, many=True)


def list_attendance(session_id=None, junior_id=None):
    q = Attendance.query
    if session_id:
        q = q.filter_by(session_id=session_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
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
