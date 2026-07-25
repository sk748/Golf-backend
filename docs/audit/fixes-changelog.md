# Phase 2/3 — Fixes Changelog

**Branch:** `audit/production-readiness` (working tree, not yet committed)
**Date:** 2026-07-12 **Verified by:** independent final-QA pass (code re-read, not summaries)

Companion to the Phase-1 audit ([00-INDEX.md](00-INDEX.md)). Every entry below was verified
three ways unless noted: (a) the current code read in full, (b) the backend suite
(143 passed / 0 failed, coverage 46% → 53%), (c) a live re-probe against a locally seeded
instance on 2026-07-12 — every exploit captured in [03-pentest.md](03-pentest.md) now returns
403 / scoped / stripped instead of the original 200/201.

## Critical

### C-1 — hole-scores object-level authorization
`backend/app/rounds/routes.py`: new `_can_access_round()` (admin/committee; round owner;
assigned coach or linked parent when the owner is a junior) enforced on hole-scores
GET-list (non-staff must pass a `round_id` they can access), POST, GET-one, and PUT — the PUT
also re-checks the *target* round when a request tries to move a hole score onto another
round. DELETE is admin-only.
*Verified:* code + suite + live re-probe (foreign read → 403, foreign write → 403).

### C-2 / MA-1 — POST /rounds identity forging + WHS mass-assignment
`backend/app/rounds/controllers.py` / `routes.py`: the mass-assigning `create_round()` was
deleted. `POST /rounds` now runs the same path as `/scores/sync`: owner + `entered_by`
stamped from the JWT; body `user_id` honoured only for admin/coach on-behalf entry (players
→ 403); `status`, `score_differential`, `handicap_after`, verification fields are computed
server-side and ignored in the body; player-entered rounds start `pending` until a
coach/admin/committee verifies (`POST /rounds/<id>/verify`).
*Verified:* code + suite + live re-probe (forged round under admin now impossible; audit's
round #63 scenario returns 403; engine fields in body ignored).

## High

### H-1 — parent round/handicap-history reads unscoped
`GET /rounds`: players forced to self; parents scoped to their linked children (an explicit
foreign `user_id` → 403). `GET /users/<id>/handicap-history`: players self-only; parents
own-children only. **Committee's club-wide read is retained deliberately** (programme
oversight role per CLAUDE.md) — confirmed not accidentally scoped down.
*Verified:* code + suite (`test_rounds_scoping.py`, 15 tests) + live re-probe.

### NEW-1 — evaluation sign-off forgeable at creation
`backend/app/evaluations/controllers.py`: `create_evaluation()` now strips the same
`_SIGNOFF_FIELDS` set as the update path (coach_signed, coach_signed_date, committee_signed,
committee_signed_date, committee_signed_by). Signatures only ever flow through the dedicated
role-guarded `coach_sign` / `committee_sign` routes, which enforce the sequential
coach-then-committee order.
*Verified:* code + suite + live re-probe — a coach POSTing an evaluation for their own junior
with forged sign-off fields got back `coach_signed=false, committee_signed=false,
committee_signed_by=null` (i.e. genuinely stripped, not merely blocked by ownership).

### P-1 — self-update could set handicap_index / membership_number
`backend/app/auth/controllers.py` `update_user()`: the non-admin strip list now includes
`cdh_number`, `membership_number`, `handicap_index` (alongside role/is_active/email).
*Verified:* code + suite (`test_auth_self_update.py`) + live re-probe with a DB-level check —
the player's stored index (15.9) was untouched after the forgery attempt.

### H-5r / NEW-2 — sessions cross-coach cluster + null-coach bypass
`backend/app/sessions/routes.py`: `coach_id` stamped from the JWT on session/class creation
(a coach cannot create under another coach); session/class edits require ownership;
enrollment create/update/delete gated by `coach_owns_junior`; booking-request list scoped by
role (requester or owning coach). Approve / decline / edit of a booking request with
**NULL `coach_id` is now admin-only** — the bypass that let any coach act on an unassigned
request is closed.
*Verified:* code + suite (`test_sessions_scoping.py`, 15 tests) + live re-probe.

### NEW-3 — tournament & handicap-journey junior reads unscoped for coaches
New shared helper `junior_in_scope()` in `backend/app/utils/decorators.py`
(admin/committee: any junior; coach: own roster only; parent: own child; player: self),
applied consistently across `tournaments/routes.py` (entries, external results,
`/juniors/<id>/competitions`, `/competition-requirements`), `handicap/routes.py`
(GET handicap-journey), and `juniors/routes.py` (progress, monthly-report — refactored from
per-route checks to the shared helper). Matches the previously-correct behaviour in the
juniors module.
*Verified:* code + suite (`test_access_scoping.py` extended) + live re-probe.

**Open/undecided residual (not a regression, flagging for a product decision):** the
**write** paths `PUT /juniors/<id>/handicap-journey` and `PUT /users/<id>/handicap` still let
*any* coach act on a junior whose `coach_id` is NULL (unassigned) — the check is
`jp.coach_id is not None and str(jp.coach_id) != str(caller.id)`, so a null coach_id short-
circuits the block. This is inconsistent with the sessions fix (H-5r/NEW-2 above), where an
unassigned (`coach_id IS NULL`) booking request is now admin-only. Read-side scoping on these
same juniors (via `junior_in_scope`) does not have this gap — only the two handicap PUT
routes. Left open pending a decision on whether unassigned juniors should be coach-writable
by any coach or admin-only.

### Dependency bumps (DEP-1 / DEP-2 / DEP-crypto / DEP-med)
`backend/requirements.txt`: Flask-Cors 3.0.10→6.0.0, gunicorn 20.1.0→22.0.0,
cryptography 39.0.1→46.0.6, requests 2.26.0→2.33.0, urllib3 1.26.12→2.7.0, Jinja2→3.1.6,
marshmallow→3.26.2, python-dotenv→1.2.2, Flask-HTTPAuth→4.8.1, plus certifi
2022.9.24→2025.10.5 (transitive, required by the requests bump). Removed unused:
uvicorn, AWSIoTPythonSDK, Flask-Script, Flask-RESTful, codeclimate-test-reporter, coveralls.
Added: redis 5.2.1 (limiter storage), reportlab 4.2.5 (PDF export).
*Verified:* requirements.txt read in full; `pip install -r requirements.txt` clean.

**Open follow-up — pip-audit is NOT fully clean.** Running `pip-audit -r requirements.txt
--no-deps` against the current pins surfaces:
- `cryptography 46.0.6` → PYSEC-2026-36 (fixed in 46.0.7) and GHSA-537c-gmf6-5ccf (fixed in
  48.0.1) — the bump landed one patch behind current advisories.
- Residual older transitive/dev pins also flagged: `h11 0.14.0`, `idna 3.4`, `mako 1.2.4`,
  `mistune 2.0.4`, `pygments 2.14.0`, `pytest 7.2.0`, `zipp 3.11.0`.

None of these are on the app's direct request-handling path (mostly dev/doc tooling and
transitive deps of alembic/flasgger/etc.), so this is a follow-up, not a re-opened security
finding — but the "pip-audit clean" sign-off item cannot be marked closed until these are
bumped.

## Medium / stability / ops

### STAB-1 — red test suite
`backend/tests/conftest.py`: `make_junior` now accepts `coach=` and persists `coach_id`.
Suite: **86 passed / 8 failed → 143 passed / 0 failed** (new scoping + reports tests added:
test_rounds_scoping, test_sessions_scoping, test_auth_self_update, test_reports_api).
Coverage 46% → 53%. This 143/0 result is the authoritative one, produced earlier with the
local Postgres instance up. A later re-run during final QA hit pool-timeout errors purely
because the local Postgres had been stopped in between the two runs (an environmental gap
between sessions, not a code regression or a new test failure) — it does not change or
undermine the 143/0 result above. Frontend smoke tests and CI wiring remain OUTSTANDING.

### CFG-1 / IV-1 / IV-2 / DEPLOY-2 — startup validation, error envelope, limits, health
`backend/main.py` + `config.py` + `app/utils/limiter.py`:
- `ProductionConfig.validate()` called at startup under `config.ProductionConfig` — fails
  fast on missing SECRET_KEY / DATABASE_URI.
- Global exception handler: uncaught errors → logged + normalized
  `{"error":{"code":"INTERNAL_ERROR",…}}` 500 (HTTPExceptions untouched).
- `MAX_CONTENT_LENGTH` = 2 MB.
- `SQLALCHEMY_ENGINE_OPTIONS`: `pool_pre_ping`, pool_size 5, max_overflow 10.
- `/health` (no auth): `SELECT 1` probe, 200/503 — used by the Docker healthcheck.
- Structured stdout logging via `logging.basicConfig`.
- Flask-Limiter storage: `REDIS_URL` when set (shared across gunicorn workers), in-memory
  fallback for dev. *(Live 429-under-Redis verification still outstanding.)*

### Dead code
`backend/app/schemas/golf.py` and `user.py` deleted; `app/schemas/__init__.py` left as an
ImportError tombstone pointing at the per-module controllers. Repo-wide grep confirms nothing
imports `app.schemas` anywhere.

## New capabilities delivered in this pass (not fixes)

### Reports-for-analysis module
`backend/app/reports/` (routes, controllers, export_xlsx, export_pdf) +
`summarize_attendance()` in `app/attendance/controllers.py` (also de-duplicates the
attendance math previously inlined in `juniors/controllers.py`) + `frontend/src/pages/reports/`
(ReportsPage, queries) with route + nav wiring.
- `GET /api/reports/junior/<id>?format=xlsx|pdf&date_from=&date_to=` — gated by
  `junior_in_scope`; the junior identity block is an **explicit allowlist** (id, name, band,
  level) — date_of_birth, medical_conditions and contact details are deliberately never
  exported.
- `GET /api/reports/programme?format=…` — admin + committee only; **aggregates only**
  (band distribution, attendance rates, assessment mix, handicap trend, participation
  counts) — never row-per-junior.
- reportlab imported lazily so app boot / xlsx never depend on it; pinned + installed (4.2.5)
  in the dev venv — the design-time concern that reportlab might be absent from the venv does
  NOT apply here; it is present.

**Open gaps in this new module (not silently omitted):**
- **PDF export branch has no automated test.** `test_reports_api.py` (7 tests) covers the
  xlsx path and all scoping (parent/coach/programme 403s, 200 happy paths, 404 on unknown
  junior) but no test exercises `?format=pdf`. The xlsx path and the scoping logic (shared by
  both formats) are covered; the PDF-specific rendering code in `export_pdf.py` is not
  exercised by any test.
- **Player role has no Reports nav entry.** The `/reports` route and its backend scoping
  (`junior_in_scope` → player sees only self) both work correctly if a player navigates there
  directly, but `nav-config.ts`'s player section was not given a `reports` nav item (unlike
  admin/coach/committee/parent, which were). This is a minor UX gap, not a security issue —
  flagging for a UX decision on whether players should have this surfaced.

### Deployment envelope (DEPLOY-1/2/3)
New: `backend/Dockerfile` (python:3.13-slim, non-root, wheels-only), `backend/entrypoint.sh`
(`flask db upgrade` before exec — migrations run on every release), `backend/gunicorn.conf.py`
(2 workers × 2 threads, port 8000, sized for a small VPS), `backend/.env.production.example`,
`frontend/Dockerfile` (node build → nginx), `frontend/nginx.conf` (SPA fallback), `Caddyfile`
(TLS + `/api/*` and `/health` → backend:8000, rest → frontend), `docker-compose.yml`
(postgres:16 + redis:7 + backend + frontend + caddy, DB healthcheck gating backend start,
backend healthcheck on `/health`), `DEPLOY.md`.
*Verified by static review only — Docker is not installed on this machine; port/paths
cross-checked (gunicorn 8000 ↔ compose healthcheck ↔ Caddy upstream all agree).*

## Outstanding as of 2026-07-12 (superseded — see 2026-07-13 section below)

Everything in this list was closed the following day; kept for history.

- ~~pip-audit clean~~ — closed 2026-07-13.
- ~~PDF export test coverage~~ — closed 2026-07-13.
- ~~Player Reports nav entry~~ — closed 2026-07-13.
- ~~Handicap PUT null-coach residual~~ — closed 2026-07-13.
- ~~FE-2 cache clear~~ — closed 2026-07-13.
- ~~FE-3 CSP header~~ — closed 2026-07-13.
- ~~`backend/RUNNING.md` stale doc~~ — closed 2026-07-13.
- ~~Full pen-test suite re-run~~ — closed 2026-07-13.
- **Frontend smoke tests; CI for both suites** — still not started (separate initiative).
- **Live Redis-backed limiter verification** and **live `docker compose up` validation** —
  still pending, blocked on an unrelated local environment repair (see below), not a code gap.

---

# 2026-07-13 — Close-out pass: Reports gaps, security/stability, full re-verification

Closes out everything flagged "outstanding" in the 2026-07-12 pass above, except the frontend
test suite (a separate initiative) and two purely environmental verifications blocked on a
local Homebrew tap repair (unrelated to this codebase).

## Reports module

- **PDF export test coverage** — added `test_parent_exports_own_childs_report_as_pdf` and
  `test_programme_report_as_pdf_for_admin` to `backend/tests/test_reports_api.py`. Both assert
  the `{filename, mime, content_base64}` envelope, `mime == "application/pdf"`, and that the
  base64-decoded bytes start with `%PDF` (a real PDF, not a stub). *Verified: included in the
  151-passed suite run below.*
- **Player Reports nav entry** — added the shared `reports` NavItem to the player role's "My
  golf" group in `frontend/src/components/layout/nav-config.ts` (all 5 roles now have it;
  previously only admin/coach/committee/parent did). *Verified: `tsc` clean.*

## Security / stability

- **pip-audit residuals closed** — `backend/requirements.txt` bumped: `cryptography`
  46.0.6→**48.0.1** (46.0.7/47.x/48.0.0 all still carried GHSA-537c-gmf6-5ccf per OSV; 48.0.1 is
  the first clean release), `h11`→0.16.0, `idna`→3.18, `Mako`→1.3.12, `mistune`→3.3.3 (2.0.4
  carried GHSA-qcq2-496w-v96p; confirmed still a real transitive dep via flasgger),
  `Pygments`→2.20.0, `pytest`→9.0.3, `zipp`→3.19.1. Two companion bumps were required for
  pip to resolve the fully-pinned tree: `packaging` 21.3→25.0 and `pluggy` 1.0.0→1.6.0 (pytest
  9 hard-requires both newer). *Verified: `pip install -r requirements.txt` clean; full suite
  re-run 151 passed / 0 failed (up from 143) — the flagged pytest-cov/pytest-9 compatibility
  risk did not materialize.*
- **FE-2 (React Query cache on logout)** — `frontend/src/auth/AuthProvider.tsx`'s `logout()`
  now calls `queryClient.clear()` (via `useQueryClient()`) immediately after clearing token/user
  state, so a shared kiosk can no longer flash the previous user's cached data. The `api.ts`
  401 path is untouched (locked file; its redirect already implicitly clears the in-memory
  cache via a full page load). *Verified: `tsc` clean.*
- **FE-3 (Content-Security-Policy)** — added to `backend/main.py`'s existing
  `_add_security_headers` hook, alongside the existing nosniff/X-Frame-Options/HSTS:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
  https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;
  connect-src 'self'; frame-ancestors 'none'` — accounts for the app's only external resource
  (Google Fonts). *Verified live: header present on every response, confirmed via `curl` against
  the running patched app.*
- **Handicap null-coach residual (NEW-3 follow-up) closed** — `backend/app/handicap/routes.py`:
  both `put_handicap_journey` and `put_user_handicap`'s coach guards changed from `coach_id is
  not None and mismatch → deny` to `coach_id is None or mismatch → deny`, so a non-admin coach
  can no longer act on an unassigned junior's handicap data (matching the sessions-module fix
  from the prior pass). Admin (and, for the manual-handicap-set route, committee — unchanged
  pre-existing behavior, noted not a regression) remain unrestricted. Six new regression tests
  added to `backend/tests/test_access_scoping.py`. *Verified: included in the 151-passed suite
  run; live-equivalent logic re-read directly.*
- **Stale doc fixed** — `backend/RUNNING.md`'s claim that dev auto-creates tables via
  `db.create_all()` replaced with the accurate `flask db upgrade` requirement; table count
  corrected 21→42.

## Full re-verification (2026-07-13, against the fully-patched app)

- **Backend:** `pytest -q --cov=app` → **151 passed, 0 failed** (up from 143), coverage 54%
  (up from 53%).
- **Frontend:** `tsc -b --noEmit`, `eslint .`, `vite build` all clean (same 2 pre-existing
  unrelated lint warnings).
- **Full pen-test battery re-run live** (not just the previously-fixed findings — the complete
  03-pentest.md scope):
  - JWT: no-token → 401; `alg=none` forged admin → 401; tampered signature → 401.
  - **Auth rate limiting: confirmed 429 trips** on repeated bad-password `/login` attempts with
    `RATELIMIT_ENABLED=true` (in-memory storage tested; Redis-backed storage verified in code,
    live Redis run still pending — see Outstanding below).
  - IDOR: player correctly 403'd reading another junior's profile; `GET /rounds` correctly
    scoped to the caller's own rounds.
  - Mass assignment: `POST /auth/register` with `role:"admin", is_admin:true` still collapses
    to the safe public-registration flow.
  - Injection fuzz: `' OR 1=1--` in a search param handled cleanly (200, no 500).
  - CORS: preflight from `https://evil.example.com` not reflected (no ACAO header).
  - Headers: CSP now present alongside the pre-existing nosniff/X-Frame-Options; no new
    info-leakage.

## Outstanding (genuinely remaining, not code gaps)

- **Frontend automated test suite + CI** — not started; a separate, larger initiative.
- **Live Redis-backed rate-limiter run** and **live `docker compose up` end-to-end
  validation** — both blocked on the same local environment issue: this machine's Homebrew
  installation had a broken/shallow `homebrew-core` tap (a pre-existing environment problem,
  unrelated to this codebase) that needed a large one-time repair fetch before `colima`/
  `docker`/`redis` could be installed. The repair was still running as of this writing; the
  underlying code/config for both (Redis storage wiring, the full Docker Compose stack) is
  already done and statically verified — this is purely about exercising it live once the
  local toolchain is available.
- **UI-quality pass** — deferred by explicit request. The layout work (bento dashboards, Tier
  0/1) is done; the color palette / overall tone is being reconsidered for the junior/minor
  audience (the current deep-ink "Projects HQ" palette read as too serious) before any further
  implementation — mockups to follow.
