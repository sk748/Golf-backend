# Overnight run — checkpoint (2026-06-11, paced across 2 token windows)

Task (Sam, before bed): **"Both: demo seed then backend test suite."** Run to
completion, paced so it spans the current token window + the next (reset ~1.5h
after kickoff) without stalling on a limit. Durable checkpoints + scheduled
resume across the reset.

## Phase 1 — Demo seed — ✅ DONE
`scripts/seed_demo.py` — idempotent (wipes domain data, reseeds) demo dataset on
the dev DB (`karen_db`).
Run: `cd <worktree> && APP_SETTINGS=config.DevelopmentConfig \
  DATABASE_URI="postgresql://postgres:postgres@localhost/karen_db" \
  PYTHONPATH=<worktree> /workspaces/Golf-backend/venv/bin/python scripts/seed_demo.py`
Produces: 27 users (3 coaches, 8 parents, 14 juniors L1–9 all bands), 54 verified
18-hole rounds (real WHS path → real handicaps), 24 signed evaluations (3 months),
classes/sessions/attendance/bookings, 2 tournaments (1 completed w/ leaderboard,
1 registration_open), 5 awarded badges, achievement unlocks, announcements, a DM
thread. **Standard logins all work** (admin/coach/committee/parent/player@kcc.test,
`password123`); **player@ is a rich L7 junior** (hi 14.6, rounds, badge, achievements)
so the demo front door shows the full experience. Verified via API (admin stats,
player handicap, tournaments). Committed.

## Phase 2 — Backend pytest test suite — ⬜ TODO (do in the fresh window)
Build a comprehensive, GREEN pytest suite for the API. No tests exist today
(top pre-staging gap).
- Infra: `tests/conftest.py` — app via `create_app()` with `config.TestingConfig`
  + `karen_test_db`; fixtures to create_all/seed minimal data/teardown per test
  (or transactional rollback); a logged-in client helper per role.
- Run in the MAIN THREAD: `APP_SETTINGS=config.TestingConfig <venv>/pytest -q`
  (agents can't run flask; I can). Reset karen_test_db first.
- Cover: auth (login/register/me, envelope exceptions, 401), role-based access &
  scoping (junior-badges parent/player scoping, parent sees only own child,
  RequireRole-equivalent backend guards), evaluations sign-off sequence + 409
  duplicate, tournaments eligibility (`check_eligibility`) + registration status,
  achievements sync (baseline silent → new unlock notifies player+parent) + GET,
  badge award/revoke + committee permission, announcements fan-out + audience,
  notifications shape, rate-limit config off in testing.
- **Do NOT fix the achievements bugs** in `docs/ACHIEVEMENTS_AUDIT.md` — where a
  test would expose one, mark it `xfail`/`skip` with a comment pointing at the
  audit, and list them in the final report. Sam decides those later.
- Finish: green suite + a short "what's covered / known-issues" report. Commit +
  converge (`git merge --ff-only feat/frontend-phase0` FROM /workspaces/Golf-backend).

## Pacing / resume
- Built Phase 1 in window 1. Sleeping across the ~1.5h reset via scheduled
  wake-ups, then building Phase 2 in the fresh window.
- If resumed by anything (scheduled wake or Sam): read this file + `git log`,
  then continue Phase 2 from the checklist above.

## Also delivered this session
- `docs/ACHIEVEMENTS_AUDIT.md` — the achievements issue audit (Sam: fix later,
  together; needs product calls). Do NOT action without him.
