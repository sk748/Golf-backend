"""Demo seed for the Junior League — DEMO ONLY, never auto-run.

Run from the worktree root:
    /workspaces/Golf-backend/venv/bin/python scripts/seed_demo_league.py

Creates a current demo league with the eight Nairobi clubs, a few completed
fixtures (so Karen leads the table), and one in-progress fixture (so the live
scoreboard hero has something to show). Re-runnable: it deletes any existing
demo league of the same name first. Uses real junior profiles for the home
pairings when available, otherwise free-text labels.
"""
import sys

from main import app
from app.database.database import db
from app.league.models import (
    League, LeagueTeam, LeagueFixture, LeaguePairing,
    LeagueStatus, FixtureStatus, PairingResult,
)
from app.juniors.models import JuniorProfile

DEMO_NAME = "Junior League 2027 (demo)"

CLUBS = [
    "Karen Country Club", "Vetlab Sports Club", "Royal Nairobi Golf Club",
    "Limuru Country Club", "Sigona Golf Club", "Golf Park",
    "Kenya Railway Golf Club", "Windsor Golf Hotel & Country Club",
]

W = PairingResult.home_win
L = PairingResult.away_win
H = PairingResult.halved
P = PairingResult.pending


def run():
    with app.app_context():
        for old in League.query.filter_by(name=DEMO_NAME).all():
            db.session.delete(old)
        db.session.commit()

        league = League(
            name=DEMO_NAME, year=2027, status=LeagueStatus.active, is_current=True,
            description="Demo data for the inter-club Junior League scoreboard.",
        )
        db.session.add(league)
        db.session.flush()

        teams = {}
        for name in CLUBS:
            t = LeagueTeam(
                league_id=league.id, name=name,
                short_name=name.split()[0],
                is_home_club=(name == "Karen Country Club"),
            )
            db.session.add(t)
            teams[name] = t
        db.session.flush()
        karen = teams["Karen Country Club"]
        juniors = JuniorProfile.query.limit(5).all()

        def fixture(home, away, status, results, rnd=None):
            f = LeagueFixture(
                league_id=league.id, home_team_id=home.id, away_team_id=away.id,
                status=status, round_number=rnd, location="Karen Country Club",
            )
            db.session.add(f)
            db.session.flush()
            for i, res in enumerate(results):
                hj = juniors[i].id if (home is karen and i < len(juniors)) else None
                db.session.add(LeaguePairing(
                    fixture_id=f.id, pairing_order=i + 1,
                    home_junior_id=hj,
                    home_label=None if hj else f"{home.short_name} player {i + 1}",
                    away_label=f"{away.short_name} player {i + 1}",
                    result=res,
                    margin="3&2" if res in (W, L) else None,
                ))
            db.session.flush()
            return f

        # Completed fixtures — Karen wins most, so it tops the table.
        fixture(karen, teams["Sigona Golf Club"], FixtureStatus.completed, [W, W, H, W], rnd=1)
        fixture(karen, teams["Golf Park"], FixtureStatus.completed, [W, H, W, W], rnd=2)
        fixture(teams["Vetlab Sports Club"], karen, FixtureStatus.completed, [L, L, W, L], rnd=3)
        # A live, in-progress fixture for the hero (some decided, some pending).
        fixture(karen, teams["Limuru Country Club"], FixtureStatus.in_progress, [W, W, H, P, P], rnd=4)

        db.session.commit()
        print(f"Seeded demo league id={league.id} ({DEMO_NAME}) with {len(CLUBS)} teams.")
        return league.id


if __name__ == "__main__":
    run()
    sys.exit(0)
