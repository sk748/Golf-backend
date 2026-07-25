"""Pytest fixtures for the tournaments integration tests (uses karen_test_db)."""

import os
os.environ["APP_SETTINGS"] = "config.TestingConfig"

from datetime import date

import pytest

from main import create_app
from app.database.database import db as _db


@pytest.fixture
def app():
    application = create_app("config.TestingConfig")
    ctx = application.app_context()
    ctx.push()
    _db.drop_all()
    _db.create_all()
    from app.courses.controllers import seed_reference_data
    seed_reference_data()
    yield application
    _db.session.remove()
    _db.drop_all()
    ctx.pop()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def make_user(app):
    from app.auth.models import User, UserRole, MembershipType
    counter = {"n": 0}

    def _make(role="admin", handicap=None, email=None):
        counter["n"] += 1
        u = User(
            email=email or f"{role}{counter['n']}@test.com",
            password_hash=User.generate_password_hash("password123"),
            first_name=role.title(), last_name="Test",
            role=UserRole(role), membership_type=MembershipType.full,
            handicap_index=handicap,
        )
        _db.session.add(u)
        _db.session.commit()
        return u
    return _make


@pytest.fixture
def auth(make_user):
    def _auth(role="admin", handicap=None):
        u = make_user(role=role, handicap=handicap)
        return u, {"Authorization": "Bearer " + u.generate_auth_token()}
    return _auth


@pytest.fixture
def make_junior(app, make_user):
    from app.juniors.models import JuniorProfile, LevelBand

    def _make(level=7, gender="male", handicap=None, dob=date(2012, 1, 1), parent=None, coach=None):
        user = make_user(role="player")
        band = LevelBand.query.filter(LevelBand.min_level <= level, LevelBand.max_level >= level).first()
        j = JuniorProfile(
            user_id=user.id, parent_id=parent.id if parent else None,
            coach_id=coach.id if coach else None,
            date_of_birth=dob, gender=gender, current_level=level, band_id=band.id,
            has_handicap=handicap is not None, handicap_index=handicap,
            experience="beginner", availability="weekends_only",
        )
        _db.session.add(j)
        _db.session.commit()
        return j
    return _make


@pytest.fixture
def make_tournament(app):
    from app.tournaments.models import Tournament
    from app.courses.models import Course, TeeSet

    def _make(**kw):
        course = Course.query.first()
        tee = TeeSet.query.filter_by(course_id=course.id, name="white", gender="men").first()
        base = dict(
            name="Test Cup", format="stroke_play", scoring_basis="gross",
            course_id=course.id, tee_set_id=tee.id, holes=18,
            start_date=date(2026, 6, 1), status="draft", counts_toward_handicap=False,
        )
        base.update(kw)
        t = Tournament(**base)
        _db.session.add(t)
        _db.session.commit()
        return t
    return _make


@pytest.fixture
def make_entry(app):
    from app.tournaments.models import TournamentEntry

    def _make(tournament, junior, status="registered", registered_by=None):
        e = TournamentEntry(
            tournament_id=tournament.id, junior_id=junior.id,
            registered_by=registered_by or junior.user_id, status=status,
            registered_at=date(2026, 6, 1),
        )
        _db.session.add(e)
        _db.session.commit()
        return e
    return _make
