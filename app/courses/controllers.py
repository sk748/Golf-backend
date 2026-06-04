from datetime import date

from app.courses.models import Course, TeeSet, Hole
from app.database.database import db
from app.utils.schemas import SimpleModelSchema

course_schema = SimpleModelSchema(Course)
courses_schema = SimpleModelSchema(Course, many=True)
tee_set_schema = SimpleModelSchema(TeeSet)
tee_sets_schema = SimpleModelSchema(TeeSet, many=True)
hole_schema = SimpleModelSchema(Hole)
holes_schema = SimpleModelSchema(Hole, many=True)


# ── Courses ─────────────────────────────────────────────────────────────────

def list_courses():
    return Course.query.all()


def get_course(course_id: int):
    return db.session.get(Course, course_id)


def create_course(data: dict):
    course = course_schema.load(data)
    db.session.add(course)
    db.session.commit()
    return course


def update_course(course, data: dict):
    for key, value in data.items():
        setattr(course, key, value)
    db.session.commit()
    return course


def delete_course(course):
    db.session.delete(course)
    db.session.commit()


def get_courses_with_tees():
    courses = Course.query.all()
    result = []
    for c in courses:
        cd = course_schema.dump(c)
        cd["tees"] = [
            {
                "id": t.id,
                "color": t.name.value if hasattr(t.name, "value") else t.name,
                "name": t.name.value if hasattr(t.name, "value") else t.name,
                "gender": t.gender.value if hasattr(t.gender, "value") else t.gender,
                "course_rating": float(t.course_rating),
                "slope_rating": t.slope_rating,
                "total_yards": t.total_yards,
            }
            for t in TeeSet.query.filter_by(course_id=c.id).all()
        ]
        result.append(cd)
    return result


# ── Tee Sets ─────────────────────────────────────────────────────────────────

def list_tee_sets(course_id=None):
    q = TeeSet.query
    if course_id:
        q = q.filter_by(course_id=course_id)
    return q.all()


def get_tee_set(tee_set_id: int):
    return db.session.get(TeeSet, tee_set_id)


def create_tee_set(data: dict):
    tee = tee_set_schema.load(data)
    db.session.add(tee)
    db.session.commit()
    return tee


def update_tee_set(tee, data: dict):
    for key, value in data.items():
        setattr(tee, key, value)
    db.session.commit()
    return tee


def delete_tee_set(tee):
    db.session.delete(tee)
    db.session.commit()


# ── Holes ────────────────────────────────────────────────────────────────────

def list_holes(course_id=None):
    q = Hole.query
    if course_id:
        q = q.filter_by(course_id=course_id)
    return q.order_by(Hole.hole_number).all()


def get_hole(hole_id: int):
    return db.session.get(Hole, hole_id)


def create_hole(data: dict):
    hole = hole_schema.load(data)
    db.session.add(hole)
    db.session.commit()
    return hole


def update_hole(hole, data: dict):
    for key, value in data.items():
        setattr(hole, key, value)
    db.session.commit()
    return hole


def delete_hole(hole):
    db.session.delete(hole)
    db.session.commit()


# ── Seed reference data ──────────────────────────────────────────────────────

_TEE_SETS = [
    ("white", "men", 73.0, 137, 6961), ("yellow", "men", 71.6, 135, 6639),
    ("blue", "men", 68.7, 123, 6035), ("red", "men", 66.7, 121, 5647),
    ("white", "women", 79.9, 144, 6961), ("yellow", "women", 78.2, 141, 6639),
    ("blue", "women", 74.2, 134, 6035), ("red", "women", 72.3, 129, 5647),
]

_HOLES = [
    (1, 4, 15, 347, 335, 312, 302), (2, 5, 7, 567, 540, 472, 460),
    (3, 5, 9, 524, 510, 460, 427), (4, 4, 3, 433, 419, 403, 365),
    (5, 3, 13, 210, 184, 160, 130), (6, 4, 1, 472, 460, 414, 384),
    (7, 3, 17, 175, 155, 143, 133), (8, 4, 11, 374, 359, 327, 314),
    (9, 4, 5, 442, 427, 379, 353), (10, 4, 14, 343, 328, 307, 292),
    (11, 4, 6, 393, 375, 347, 332), (12, 4, 18, 332, 295, 294, 258),
    (13, 4, 2, 452, 439, 405, 379), (14, 3, 16, 147, 139, 120, 115),
    (15, 5, 8, 554, 521, 461, 437), (16, 3, 12, 195, 183, 171, 156),
    (17, 4, 4, 449, 437, 370, 360), (18, 5, 10, 552, 533, 490, 450),
]


def seed_reference_data():
    from app.juniors.models import LevelBand, LevelBenchmark
    from app.tournaments.models import Tournament

    course = Course.query.filter_by(name="Karen Country Club").first()
    if course is None:
        course = Course(name="Karen Country Club", par=72, altitude_ft=6000, grass_type="Kikuyu")
        db.session.add(course)
        db.session.flush()

    for name, gender, cr, sr, yards in _TEE_SETS:
        if not TeeSet.query.filter_by(course_id=course.id, name=name, gender=gender).first():
            db.session.add(TeeSet(course_id=course.id, name=name, gender=gender,
                                  course_rating=cr, slope_rating=sr, total_yards=yards))

    for hole_num, par, si, w, y, b, r in _HOLES:
        if not Hole.query.filter_by(course_id=course.id, hole_number=hole_num).first():
            db.session.add(Hole(course_id=course.id, hole_number=hole_num, par=par,
                                stroke_index=si, white_yards=w, yellow_yards=y,
                                blue_yards=b, red_yards=r))

    _LEVEL_BANDS = [
        ("Levels 1-3", "Beginners", 1, 3, 12, "skills",
         "Putting, chipping, full-swing basics, etiquette, safety. Clinics of max 6 golfers."),
        ("Levels 4-5", "Attaining Handicap", 4, 5, 24, "practice_scores",
         "Course lessons in groups of about 4. Get scorecards signed for a handicap."),
        ("Levels 6-8", "Intermediate & Advanced", 6, 8, 24, "competition",
         "Competitive play, green reading, game management."),
        ("Level 9+", "Enhanced / Elite", 9, 99, 24, "competition",
         "Handicap index 15 and below; sub-84 rounds consistently."),
    ]
    for name, label, min_l, max_l, min_s, tmpl, desc in _LEVEL_BANDS:
        if not LevelBand.query.filter_by(min_level=min_l, max_level=max_l).first():
            db.session.add(LevelBand(name=name, band_label=label, min_level=min_l, max_level=max_l,
                                     min_sessions=min_s, report_template=tmpl, description=desc))

    for level, fs, ag, pt, nh in [(6, 21, 8, 19, 48), (7, 20, 7, 18, 45), (8, 19, 6, 17, 42)]:
        if not LevelBenchmark.query.filter_by(level_number=level).first():
            db.session.add(LevelBenchmark(level_number=level, full_swing_target=fs,
                                          around_green_target=ag, putting_target=pt,
                                          nine_hole_target=nh))

    if not Tournament.query.filter_by(name="Karen Rumble 2.0", year=2026).first():
        db.session.add(Tournament(
            name="Karen Rumble 2.0", year=2026, format="Four Ball Better Ball",
            handicap_allowance=0.90, max_stroke_diff=8, min_games=8, max_games=12,
            qualify_top_n=16, points_win=3, points_tie=2, points_loss=1,
            penalty_late_cancel=-3, penalty_declined=-3, status="registration",
        ))

    db.session.commit()
    return {"course_id": course.id, "seeded_at": date.today().isoformat()}
