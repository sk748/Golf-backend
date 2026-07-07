# Overnight run — ✅ ALL DONE (2026-06-11/12, paced across 2 token windows)

FINAL STATE: Phase 1 demo seed ✅ · Phase 2 test suite ✅ (94 passed/0 failed) ·
Phase 3 security review ✅ BOTH passes merged into docs/SECURITY_REVIEW.md
(read-only; triage with Sam — top items: hole-scores unscoped C-1, rounds body
forgery C-2+MA-1, evaluation sign-off forgery MA-2, sessions cluster H-5,
Flask-Cors/gunicorn bumps DEP-1/2). Achievements issues remain parked in
docs/ACHIEVEMENTS_AUDIT.md per Sam. Nothing fixed without him.

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

## REVISED PLAN (Sam said "keep going" + "then run a thorough /security-review overnight")
- Do Phase 2 (tests) NOW (still room in window) — there is ALREADY a pytest suite
  (tests/conftest.py + test_audit/test_player_self/test_scoring/test_tournaments_api);
  EXTEND it, don't reinvent. Fixtures: app/client/make_user/auth/make_junior/
  make_tournament/make_entry.
- Then Phase 3 = a THOROUGH SECURITY REVIEW overnight. NOTE: `/security-review` is
  NOT a registered command/skill in this repo (only new-page, restart-servers) — so
  it's a manual comprehensive security audit (authorized: our own codebase, defensive).
  Output a docs/SECURITY_REVIEW.md with severity-ranked findings; do NOT fix without Sam.
- A ScheduleWakeup (≈21:25) still pending from the earlier pacing; when it fires,
  re-read this file + `git log` and continue whatever's unfinished (tests, then
  security review). Pace across token windows.

## Phase 3 — Security review — 🟡 IN PROGRESS (two passes)
Thorough manual security audit (no /security-review command exists; our own code,
defensive). READ-ONLY: findings only, no fixes without Sam.
- Pass 1 — ✅ DONE, merged into docs/SECURITY_REVIEW.md (commit 9bdf108).
  2 Critical (hole-scores unscoped; POST /rounds arbitrary user_id), 5 High,
  8 Medium. NEXT STEP WHEN RESUMED: run Pass 2 (spec below), append to
  docs/SECURITY_REVIEW.md, commit + converge, write Sam's morning summary.
  (The pending ScheduleWakeup prompt still says "Phase 2 tests" — that's stale;
  tests are done. Follow THIS file.)
- Pass 1 spec (done): authn/authz — JWT handling,
  token lifetime/identity, role guards on EVERY route (grep for missing
  @require_*), IDOR/scoping (juniors, rounds, evaluations, tournaments, messaging,
  notifications, booking, handicap journeys), privilege escalation paths
  (role changes, parent-child links, registration).
- Pass 2 (after reset): injection/ORM safety (raw SQL, .filter text), input
  validation (mass assignment via SimpleModelSchema.load!), secrets/config
  (SECRET_KEY/JWT defaults, DATABASE_URI, debug, CORS/headers), rate limiting,
  messaging safety pack (banned words bypass, flag flow), file/CSV import
  (bulk import parsing), frontend (token storage, XSS via rendered content,
  api client), dependency quick-scan.
- Assemble docs/SECURITY_REVIEW.md severity-ranked; commit + converge; final
  morning summary for Sam.

## Phase 2 — Backend pytest test suite — ✅ DONE (commit 5bd36f6)
7 new modules, ~51 tests; suite total 94 passed 0 failed. Covers auth envelope
exceptions, junior-badges/progress scoping, evaluations sign-off + 409, badges
catalog/award permissions + notify, achievements baseline/sync + notify,
announcements fan-out/targeting/public, notifications feed/mark-read.
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
