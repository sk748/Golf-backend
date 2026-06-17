"""
Junior League — business logic / controller helpers.

All database mutations go through here. Routes stay thin.
"""
from decimal import Decimal

from app.database.database import db
from app.league.models import (
    League, LeagueTeam, LeagueFixture, LeaguePairing,
    FixtureStatus, PairingResult,
)
from app.utils.schemas import SimpleModelSchema

# ── Schemas ───────────────────────────────────────────────────────────────────

league_schema = SimpleModelSchema(League)
team_schema = SimpleModelSchema(LeagueTeam)
fixture_schema = SimpleModelSchema(LeagueFixture)
pairing_schema = SimpleModelSchema(LeaguePairing)

# ── Allowed update fields (mass-assignment guard) ─────────────────────────────

LEAGUE_UPDATE_ALLOWED = {
    "name", "year", "status", "is_current", "points_win", "points_halve",
    "points_loss", "description",
}

TEAM_UPDATE_ALLOWED = {
    "name", "short_name", "is_home_club",
}

FIXTURE_UPDATE_ALLOWED = {
    "round_number", "date", "location", "status",
}

PAIRING_UPDATE_ALLOWED = {
    "pairing_order", "format", "home_junior_id", "home_partner_junior_id",
    "home_label", "away_label", "away_partner_label", "result", "margin",
}

# ── CRUD helpers ──────────────────────────────────────────────────────────────

# League ---

def get_league(league_id):
    return db.session.get(League, league_id)


def list_leagues(current_only=False):
    q = League.query
    if current_only:
        q = q.filter_by(is_current=True)
    return q.order_by(League.year.desc().nulls_last(), League.id.desc()).all()


def create_league(data):
    league = league_schema.load(data)
    db.session.add(league)
    db.session.commit()
    return league


def update_league(league, data):
    fields = league_schema.coerce_fields(data, allowed=LEAGUE_UPDATE_ALLOWED)
    for k, v in fields.items():
        setattr(league, k, v)
    db.session.commit()
    return league


def delete_league(league):
    db.session.delete(league)
    db.session.commit()


# LeagueTeam ---

def get_team(team_id):
    return db.session.get(LeagueTeam, team_id)


def list_teams(league_id):
    return LeagueTeam.query.filter_by(league_id=league_id).all()


def create_team(data):
    team = team_schema.load(data)
    db.session.add(team)
    db.session.commit()
    return team


def update_team(team, data):
    fields = team_schema.coerce_fields(data, allowed=TEAM_UPDATE_ALLOWED)
    for k, v in fields.items():
        setattr(team, k, v)
    db.session.commit()
    return team


def delete_team(team):
    db.session.delete(team)
    db.session.commit()


# LeagueFixture ---

def get_fixture(fixture_id):
    return db.session.get(LeagueFixture, fixture_id)


def list_fixtures(league_id):
    return (
        LeagueFixture.query
        .filter_by(league_id=league_id)
        .order_by(LeagueFixture.round_number.asc().nulls_last(),
                  LeagueFixture.date.asc().nulls_last())
        .all()
    )


def create_fixture(data):
    fixture = fixture_schema.load(data)
    db.session.add(fixture)
    db.session.commit()
    return fixture


def update_fixture(fixture, data):
    fields = fixture_schema.coerce_fields(data, allowed=FIXTURE_UPDATE_ALLOWED)
    for k, v in fields.items():
        setattr(fixture, k, v)
    db.session.commit()
    return fixture


def delete_fixture(fixture):
    db.session.delete(fixture)
    db.session.commit()


# LeaguePairing ---

def get_pairing(pairing_id):
    return db.session.get(LeaguePairing, pairing_id)


def create_pairing(data):
    pairing = pairing_schema.load(data)
    db.session.add(pairing)
    db.session.commit()
    return pairing


def update_pairing(pairing, data):
    fields = pairing_schema.coerce_fields(data, allowed=PAIRING_UPDATE_ALLOWED)
    for k, v in fields.items():
        setattr(pairing, k, v)
    db.session.commit()
    return pairing


def delete_pairing(pairing):
    db.session.delete(pairing)
    db.session.commit()


# ── Scoring logic ─────────────────────────────────────────────────────────────

def pairing_points(pairing, league):
    """Return (home_pts, away_pts) for a single pairing using the league's
    configurable point values. A pending pairing contributes (0, 0)."""
    result = getattr(pairing.result, "value", pairing.result)
    pw = Decimal(str(league.points_win))
    ph = Decimal(str(league.points_halve))
    pl = Decimal(str(league.points_loss))
    if result == PairingResult.home_win.value:
        return (pw, pl)
    if result == PairingResult.away_win.value:
        return (pl, pw)
    if result == PairingResult.halved.value:
        return (ph, ph)
    # pending
    return (Decimal("0"), Decimal("0"))


def fixture_summary(fixture, league):
    """Compute and return a summary dict for a fixture.

    Sums pairing points for home and away sides. Fixture result:
      - 'pending' if no pairing has a decided result
      - 'home_win' / 'away_win' / 'halved' based on totals
    Also includes team display names.
    """
    home_total = Decimal("0")
    away_total = Decimal("0")
    any_decided = False

    for p in fixture.pairings:
        result_val = getattr(p.result, "value", p.result)
        if result_val != PairingResult.pending.value:
            any_decided = True
        hp, ap = pairing_points(p, league)
        home_total += hp
        away_total += ap

    if not any_decided:
        fixture_result = "pending"
    elif home_total > away_total:
        fixture_result = "home_win"
    elif away_total > home_total:
        fixture_result = "away_win"
    else:
        fixture_result = "halved"

    return {
        "home_points": float(home_total),
        "away_points": float(away_total),
        "result": fixture_result,
        "home_team_name": fixture.home_team.name if fixture.home_team else None,
        "away_team_name": fixture.away_team.name if fixture.away_team else None,
    }


# ── Standings ─────────────────────────────────────────────────────────────────

def compute_standings(league):
    """Return a list of standing rows sorted by points desc, then average desc.

    Each row: {team_id, team_name, is_home_club, played, won, drawn, lost,
               points, average}.

    'points' here is the sum of each team's pairing-level points across all
    completed fixtures that team participated in (not fixture-level wins —
    that would be the correct league-table interpretation). If a client wants
    fixture-level W/D/L, played/won/drawn/lost counts fixture results.
    """
    # Initialise accumulators keyed by team id.
    totals = {}
    for team in league.teams:
        totals[team.id] = {
            "team_id": team.id,
            "team_name": team.name,
            "is_home_club": team.is_home_club,
            "played": 0,
            "won": 0,
            "drawn": 0,
            "lost": 0,
            "points": Decimal("0"),
        }

    for fixture in league.fixtures:
        f_status = getattr(fixture.status, "value", fixture.status)
        if f_status != FixtureStatus.completed.value:
            continue

        summary = fixture_summary(fixture, league)
        home_id = fixture.home_team_id
        away_id = fixture.away_team_id

        if home_id not in totals or away_id not in totals:
            continue  # team not in league's team list (shouldn't happen)

        totals[home_id]["played"] += 1
        totals[away_id]["played"] += 1
        totals[home_id]["points"] += Decimal(str(summary["home_points"]))
        totals[away_id]["points"] += Decimal(str(summary["away_points"]))

        f_result = summary["result"]
        if f_result == "home_win":
            totals[home_id]["won"] += 1
            totals[away_id]["lost"] += 1
        elif f_result == "away_win":
            totals[away_id]["won"] += 1
            totals[home_id]["lost"] += 1
        elif f_result == "halved":
            totals[home_id]["drawn"] += 1
            totals[away_id]["drawn"] += 1

    rows = []
    for row in totals.values():
        played = row["played"]
        points = float(row["points"])
        average = round(points / played, 2) if played > 0 else 0.0
        rows.append({
            "team_id": row["team_id"],
            "team_name": row["team_name"],
            "is_home_club": row["is_home_club"],
            "played": played,
            "won": row["won"],
            "drawn": row["drawn"],
            "lost": row["lost"],
            "points": points,
            "average": average,
        })

    rows.sort(key=lambda r: (-r["points"], -r["average"]))
    return rows


# ── Serialization helpers ─────────────────────────────────────────────────────

def _junior_display_name(junior_profile):
    """Resolve a JuniorProfile -> first + last name via its user relationship."""
    if junior_profile is None:
        return None
    user = getattr(junior_profile, "user", None)
    if user is None:
        return None
    return f"{user.first_name} {user.last_name}".strip() or None


def dump_pairing(pairing):
    """Serialize a LeaguePairing with augmented junior display names."""
    out = pairing_schema.dump(pairing)
    out["home_junior_name"] = _junior_display_name(pairing.home_junior)
    out["home_partner_junior_name"] = _junior_display_name(pairing.home_partner_junior)
    return out


def dump_fixture_detail(fixture, league):
    """Serialize a LeagueFixture with computed summary + nested pairings."""
    out = fixture_schema.dump(fixture)
    out["summary"] = fixture_summary(fixture, league)
    out["pairings"] = [dump_pairing(p) for p in fixture.pairings]
    return out


def dump_league_with_teams(league):
    """Serialize a League with its teams list."""
    out = league_schema.dump(league)
    out["teams"] = [team_schema.dump(t) for t in league.teams]
    return out
