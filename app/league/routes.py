"""
Junior League routes.

Blueprint: league_bp, url_prefix="/api".

Read endpoints (@require_auth, all authenticated roles):
  GET  /api/leagues                      — list all leagues (optional ?current=true)
  GET  /api/leagues/<id>                 — league detail with teams
  GET  /api/leagues/<id>/standings       — computed standings table
  GET  /api/leagues/<id>/fixtures        — all fixtures with summaries + pairings
  GET  /api/fixtures/<id>               — fixture detail with pairings
  GET  /api/league/scoreboard            — headline widget for dashboard/hero

Write endpoints (@require_roles("admin","coach","committee")):
  POST   /api/leagues
  PUT    /api/leagues/<id>
  DELETE /api/leagues/<id>
  PUT    /api/leagues/<id>/set-current

  POST   /api/league-teams
  PUT    /api/league-teams/<id>
  DELETE /api/league-teams/<id>

  POST   /api/league-fixtures
  PUT    /api/league-fixtures/<id>
  DELETE /api/league-fixtures/<id>

  POST   /api/league-pairings
  PUT    /api/league-pairings/<id>
  DELETE /api/league-pairings/<id>
"""
from flask import Blueprint, jsonify, request

from app.database.database import db
from app.league.controllers import (
    league_schema, team_schema, fixture_schema,
    get_league, list_leagues, create_league, update_league, delete_league,
    get_team, list_teams, create_team, update_team, delete_team,
    get_fixture, list_fixtures, create_fixture, update_fixture, delete_fixture,
    get_pairing, create_pairing, update_pairing, delete_pairing,
    compute_standings, dump_fixture_detail, dump_league_with_teams, dump_pairing,
    fixture_summary, sync_fixture_event, sync_fixture_attendance,
)
from app.league.models import League, LeagueTeam, LeagueFixture, LeaguePairing
from app.utils.decorators import require_auth, require_roles, get_current_user

league_bp = Blueprint("league_bp", __name__, url_prefix="/api")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


def _require_league(league_id):
    """Return (league, None) or (None, error_response)."""
    league = get_league(league_id)
    if league is None:
        return None, _not_found("League")
    return league, None


def _require_team(team_id):
    team = get_team(team_id)
    if team is None:
        return None, _not_found("LeagueTeam")
    return team, None


def _require_fixture(fixture_id):
    fixture = get_fixture(fixture_id)
    if fixture is None:
        return None, _not_found("LeagueFixture")
    return fixture, None


def _require_pairing(pairing_id):
    pairing = get_pairing(pairing_id)
    if pairing is None:
        return None, _not_found("LeaguePairing")
    return pairing, None


# ── Read: Leagues ─────────────────────────────────────────────────────────────

@league_bp.route("/leagues", methods=["GET"])
@require_auth
def get_leagues():
    current_only = request.args.get("current", "").lower() in ("true", "1", "yes")
    items = list_leagues(current_only=current_only)
    return _data([league_schema.dump(lg) for lg in items], count=len(items))


@league_bp.route("/leagues/<int:league_id>", methods=["GET"])
@require_auth
def get_league_detail(league_id):
    league, err = _require_league(league_id)
    if err:
        return err
    return _data(dump_league_with_teams(league))


@league_bp.route("/leagues/<int:league_id>/standings", methods=["GET"])
@require_auth
def get_standings(league_id):
    league, err = _require_league(league_id)
    if err:
        return err
    rows = compute_standings(league)
    return _data(rows, count=len(rows))


@league_bp.route("/leagues/<int:league_id>/fixtures", methods=["GET"])
@require_auth
def get_fixtures(league_id):
    league, err = _require_league(league_id)
    if err:
        return err
    fixtures = list_fixtures(league_id)
    out = [dump_fixture_detail(f, league) for f in fixtures]
    return _data(out, count=len(out))


# ── Read: Fixture detail ──────────────────────────────────────────────────────

@league_bp.route("/fixtures/<int:fixture_id>", methods=["GET"])
@require_auth
def get_fixture_detail(fixture_id):
    fixture, err = _require_fixture(fixture_id)
    if err:
        return err
    return _data(dump_fixture_detail(fixture, fixture.league))


# ── Read: Scoreboard (dashboard hero) ─────────────────────────────────────────

@league_bp.route("/league/scoreboard", methods=["GET"])
@require_auth
def get_scoreboard():
    """Return the is_current league's headline data for the dashboard hero.

    Payload: {league, standings (top 5), next_fixture, recent_fixture}.
    Returns null league gracefully if no current league exists.
    """
    leagues = list_leagues(current_only=True)
    if not leagues:
        return _data({
            "league": None,
            "standings": [],
            "next_fixture": None,
            "recent_fixture": None,
        })

    league = leagues[0]
    standings = compute_standings(league)

    from app.league.models import FixtureStatus
    from datetime import date as _date

    all_fixtures = list_fixtures(league.id)

    # Next fixture: earliest scheduled/in_progress with a date >= today, or
    # the first without a date, ordered by round then id.
    today = _date.today()
    upcoming = [
        f for f in all_fixtures
        if getattr(f.status, "value", f.status) in (
            FixtureStatus.scheduled.value, FixtureStatus.in_progress.value
        )
    ]
    next_fixture = None
    if upcoming:
        dated = [f for f in upcoming if f.date is not None and f.date >= today]
        undated = [f for f in upcoming if f.date is None or f.date < today]
        candidates = sorted(dated, key=lambda f: (f.date, f.id)) + \
                     sorted(undated, key=lambda f: (f.round_number or 9999, f.id))
        if candidates:
            next_fixture = dump_fixture_detail(candidates[0], league)

    # Most-recent completed fixture.
    completed = [
        f for f in all_fixtures
        if getattr(f.status, "value", f.status) == FixtureStatus.completed.value
    ]
    recent_fixture = None
    if completed:
        most_recent = sorted(
            completed,
            key=lambda f: (f.date or _date.min, f.id),
            reverse=True,
        )[0]
        recent_fixture = dump_fixture_detail(most_recent, league)

    return _data({
        "league": dump_league_with_teams(league),
        "standings": standings[:5],
        "next_fixture": next_fixture,
        "recent_fixture": recent_fixture,
    })


# ── Write: Leagues ────────────────────────────────────────────────────────────

@league_bp.route("/leagues", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_league():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name or len(name) > 255:
        return _err("VALIDATION_ERROR", "name is required (max 255 characters)", 400)
    try:
        league = create_league(data)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(league_schema.dump(league), 201)


@league_bp.route("/leagues/<int:league_id>", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def put_league(league_id):
    league, err = _require_league(league_id)
    if err:
        return err
    data = request.get_json() or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name or len(name) > 255:
            return _err("VALIDATION_ERROR", "name is required (max 255 characters)", 400)
    try:
        league = update_league(league, data)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(league_schema.dump(league))


@league_bp.route("/leagues/<int:league_id>", methods=["DELETE"])
@require_roles("admin", "coach", "committee")
def del_league(league_id):
    league, err = _require_league(league_id)
    if err:
        return err
    try:
        delete_league(league)
    except Exception as exc:
        db.session.rollback()
        return _err("CONFLICT", str(exc), 409)
    return "", 204


@league_bp.route("/leagues/<int:league_id>/set-current", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def set_current_league(league_id):
    """Mark this league as is_current=True and clear all others."""
    league, err = _require_league(league_id)
    if err:
        return err
    # Clear is_current on all other leagues first.
    League.query.filter(League.id != league_id).update(
        {"is_current": False}, synchronize_session="fetch"
    )
    league.is_current = True
    db.session.commit()
    return _data(dump_league_with_teams(league))


# ── Write: League Teams ───────────────────────────────────────────────────────

@league_bp.route("/league-teams", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_team():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name or len(name) > 255:
        return _err("VALIDATION_ERROR", "name is required (max 255 characters)", 400)
    league_id = data.get("league_id")
    if not league_id or get_league(league_id) is None:
        return _err("VALIDATION_ERROR", "league_id must reference an existing league", 400)
    try:
        team = create_team(data)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(team_schema.dump(team), 201)


@league_bp.route("/league-teams/<int:team_id>", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def put_team(team_id):
    team, err = _require_team(team_id)
    if err:
        return err
    data = request.get_json() or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name or len(name) > 255:
            return _err("VALIDATION_ERROR", "name is required (max 255 characters)", 400)
    try:
        team = update_team(team, data)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(team_schema.dump(team))


@league_bp.route("/league-teams/<int:team_id>", methods=["DELETE"])
@require_roles("admin", "coach", "committee")
def del_team(team_id):
    team, err = _require_team(team_id)
    if err:
        return err
    try:
        delete_team(team)
    except Exception as exc:
        db.session.rollback()
        return _err("CONFLICT", str(exc), 409)
    return "", 204


# ── Write: League Fixtures ────────────────────────────────────────────────────

@league_bp.route("/league-fixtures", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_fixture():
    data = request.get_json() or {}
    league_id = data.get("league_id")
    if not league_id or get_league(league_id) is None:
        return _err("VALIDATION_ERROR", "league_id must reference an existing league", 400)
    home_team_id = data.get("home_team_id")
    away_team_id = data.get("away_team_id")
    if not home_team_id or get_team(home_team_id) is None:
        return _err("VALIDATION_ERROR", "home_team_id must reference an existing team", 400)
    if not away_team_id or get_team(away_team_id) is None:
        return _err("VALIDATION_ERROR", "away_team_id must reference an existing team", 400)
    if home_team_id == away_team_id:
        return _err("VALIDATION_ERROR", "home_team_id and away_team_id must differ", 400)
    try:
        fixture = create_fixture(data)
        sync_fixture_event(fixture, get_current_user().id)
        sync_fixture_attendance(fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(dump_fixture_detail(fixture, fixture.league), 201)


@league_bp.route("/league-fixtures/<int:fixture_id>", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def put_fixture(fixture_id):
    fixture, err = _require_fixture(fixture_id)
    if err:
        return err
    data = request.get_json() or {}
    try:
        fixture = update_fixture(fixture, data)
        sync_fixture_event(fixture, get_current_user().id)
        sync_fixture_attendance(fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(dump_fixture_detail(fixture, fixture.league))


@league_bp.route("/league-fixtures/<int:fixture_id>", methods=["DELETE"])
@require_roles("admin", "coach", "committee")
def del_fixture(fixture_id):
    fixture, err = _require_fixture(fixture_id)
    if err:
        return err
    try:
        # Remove the mirrored calendar Event first (attendance cascades with the
        # fixture). The fixture's event_id FK is cleared by deleting the fixture.
        if fixture.event_id:
            from app.events.models import Event
            ev = db.session.get(Event, fixture.event_id)
            fixture.event_id = None
            db.session.flush()
            if ev is not None:
                db.session.delete(ev)
        delete_fixture(fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("CONFLICT", str(exc), 409)
    return "", 204


# ── Write: League Pairings ────────────────────────────────────────────────────

@league_bp.route("/league-pairings", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_pairing():
    data = request.get_json() or {}
    fixture_id = data.get("fixture_id")
    if not fixture_id or get_fixture(fixture_id) is None:
        return _err("VALIDATION_ERROR", "fixture_id must reference an existing fixture", 400)
    try:
        pairing = create_pairing(data)
        sync_fixture_attendance(pairing.fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(dump_pairing(pairing), 201)


@league_bp.route("/league-pairings/<int:pairing_id>", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def put_pairing(pairing_id):
    pairing, err = _require_pairing(pairing_id)
    if err:
        return err
    data = request.get_json() or {}
    try:
        pairing = update_pairing(pairing, data)
        sync_fixture_attendance(pairing.fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(dump_pairing(pairing))


@league_bp.route("/league-pairings/<int:pairing_id>", methods=["DELETE"])
@require_roles("admin", "coach", "committee")
def del_pairing(pairing_id):
    pairing, err = _require_pairing(pairing_id)
    if err:
        return err
    fixture = pairing.fixture
    try:
        delete_pairing(pairing)
        sync_fixture_attendance(fixture)
    except Exception as exc:
        db.session.rollback()
        return _err("CONFLICT", str(exc), 409)
    return "", 204
