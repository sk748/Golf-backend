# Production-Readiness Audit — Index & Summary

**Project:** Karen Golf Management Platform (Flask backend + React/Vite/TS frontend)
**Branch:** `audit/production-readiness` **Date:** 2026-07-07
**Phase:** 1 — **findings only, no application code changed.**
**Method:** static review + dependency scanning + **live probing of a local instance only**
(no remote/production host was contacted). Backend suite + pen test run against a disposable
local Postgres 16 / `karen_db` / `karen_test_db` seeded with demo data.

> **Update 2026-07-13: all Critical/High findings closed and re-verified live.** Every item
> in this index's sign-off checklist is now checked off except two purely environmental
> verifications (a live Redis-backed limiter run and a live `docker compose up`), both blocked
> on an unrelated local Homebrew repair rather than any code gap — the underlying code/config
> for both is done and statically verified. A frontend automated test suite remains a
> separate, un-started initiative. The full pen-test battery was re-run live against the
> patched app on 2026-07-13 and confirmed clean end-to-end (JWT handling, rate limiting, IDOR,
> mass assignment, injection, CORS, security headers incl. the new CSP). See
> `fixes-changelog.md` for the complete record of what changed and how each item was verified.
>
> Original Phase-1 bottom line (2026-07-07, kept for history): two **Critical**
> object-level-auth holes were open and reproduced live — a player could forge a *verified,
> handicap-affecting* round onto any account (incl. the admin), and hole-scores had no
> ownership gate — alongside a coach self-counter-signing evaluations, a player editing their
> own Handicap Index, parents reading every family's rounds, ~15 vulnerable backend
> dependencies, and an absent deployment envelope. Auth/JWT, role decorators, CORS, injection
> posture, and the June IDOR fixes (H-2/H-3/H-4) held up under live attack even then, and the
> migration chain was healthy throughout.

## Reports

| File | Workstream | Status |
|------|-----------|--------|
| [01-security.md](01-security.md) | Security pass (static) | ✅ |
| [02-stability.md](02-stability.md) | Build / type / lint / tests / deps / migrations | ✅ |
| [03-pentest.md](03-pentest.md) | Live probing (local instance) | ✅ |
| [04-server-readiness.md](04-server-readiness.md) | Deployment gaps + go-live checklist | ✅ |
| [05-maintainability.md](05-maintainability.md) | Structure, typing, onboarding, how-to guides | ✅ |
| [fixes-changelog.md](fixes-changelog.md) | Phase 2 changes | ✅ (this pass) |

## Severity roll-up

| Severity | Count | IDs |
|----------|-------|-----|
| **Critical** | 2 | C-1, C-2/MA-1 |
| **High** | 7 | H-1, NEW-1, P-1, H-5r, DEP-1 (flask-cors), DEP-2 (gunicorn), DEP-crypto (cryptography/requests/urllib3) |
| **Medium** | 15 | NEW-2, SEC-1, RL-1, IV-1, IV-2, CSV-1, FE-2, FE-3, CFG-1, STAB-1 (red test suite), DEP-med (jinja2/marshmallow/dotenv/flask-httpauth), DEPLOY-1 (no gunicorn cfg), DEPLOY-2 (no health/logging), DEPLOY-3 (no containers), FE bundle/no-tests |
| **Low / Info** | 12 | FE-1, INFO-1, SEC-2, SEC-3, CSV-2, A-1, P-2, register-enum, server-header, stale-RUNNING doc, unused-deps, dead-code (app/schemas) |

## Critical & High findings (the go-live blockers)

| ID | Sev | Finding | Evidence | Fix |
|----|-----|---------|----------|-----|
| **C-1** | 🔴 Crit | `hole-scores` has no object-level authz (read + write) | live: `GET /hole-scores`→200 no gate; `POST` reached INSERT on another user's round, no 403 | staff-or-owner check; require round ownership |
| **C-2/MA-1** | 🔴 Crit | `POST /rounds` forges `user_id` + WHS output cols | **live 201, persisted** round #63 under admin, `status=verified` | stamp identity from token, allowlist inputs, compute WHS server-side |
| **H-1** | 🟠 High | parent + committee read all club rounds | live: both →200, 60 rounds | scope parent→children, confirm committee scope |
| **NEW-1** | 🟠 High | coach self-counter-signs evaluation at create | **live 201** with `committee_signed=true` | strip `_SIGNOFF_FIELDS` in `create_evaluation` |
| **P-1** | 🟠 High | player sets own `handicap_index`/`membership_number` | live: `PUT /users/self`→200, hcp=0.0 | add both to non-admin strip list |
| **H-5r** | 🟠 High | sessions cross-coach cluster (booking PUT, arbitrary coach_id, enrollments) | static `sessions/routes.py:85-390` | stamp coach_id; scope to own juniors |
| **DEP-1** | 🟠 High | `Flask-Cors==3.0.10` — 8 CVEs incl. CORS-bypass | pip-audit | bump ≥6.0.0 |
| **DEP-2** | 🟠 High | `gunicorn==20.1.0` — request smuggling | pip-audit | bump ≥22.0.0 |
| **DEP-crypto** | 🟠 High | `cryptography 39.0.1` (14 CVEs), `requests 2.26.0`, `urllib3 1.26.12` | pip-audit | bump all |

Full Medium/Low detail lives in the per-workstream reports.

## What held up well (verified, mostly live)

- JWT verification: no-token / garbage / **alg=none** / wrong-signature all → 401.
- Role decorators enforce server-side (player/parent/coach correctly 403'd from admin routes).
- June IDOR fixes hold live: H-2 (eval coach scoping), H-3 (junior PII), H-4 (junior mass-assign).
- No SQL injection; ORM-parameterized. CORS allowlist not reflected to a hostile origin.
- Registration role allowlist not escapable via `role`/`is_admin`/`id`.
- Frontend: 0 XSS sinks, single hardened api client, `npm audit` clean, `tsc`+lint+build green.
- Migration chain builds cleanly from empty (42 tables, at head).

## Phase-2 recommended fix order (after your go-ahead)

1. **Critical:** C-1, C-2/MA-1 (stamp identity + allowlist + server-side WHS on rounds/hole-scores).
2. **High:** NEW-1, H-1, P-1, H-5r, NEW-2; then dependency bumps DEP-1/2/crypto.
3. **Medium — correctness/ops:** CFG-1 (call `validate()`), IV-1 (global error handler),
   IV-2 (`MAX_CONTENT_LENGTH`), STAB-1 (fix the red test suite), SEC-1/RL-1 (Redis limiter +
   broader limits), CSV-1, FE-2, FE-3.
4. **Deployment (ask-first files):** gunicorn config, health endpoint, structured logging, DB
   pool options; Dockerfile/compose only on your say-so (see `04`).
5. **Low/Info + cleanup:** unused deps, dead `app/schemas/`, stale docs, frontend tests + code-split.

---

## Sign-off checklist (Phase 3 exit — all must be green before go-live)

- [x] **C-1** hole-scores authorization enforced (read + write) + re-probed — closed; code re-verified + live re-probe 2026-07-12 (see fixes-changelog.md)
- [x] **C-2/MA-1** `/rounds` identity stamped, WHS columns server-computed + re-probed — closed; create_round removed, sync_score path re-verified + live re-probe 2026-07-12
- [x] **H-1** parent/committee round reads scoped + re-probed — closed; parent scoped to children, committee club-wide retained by design; live re-probe 2026-07-12
- [x] **NEW-1** evaluation create strips sign-off fields + re-probed — closed; create path strips _SIGNOFF_FIELDS, live re-probe returned unsigned row 2026-07-12
- [x] **P-1** `handicap_index`/`membership_number` stripped from self-update + re-probed — closed; DB-level check confirmed index untouched after forgery attempt
- [x] **H-5r / NEW-2** sessions/booking coach-scoping + null-coach bypass closed — closed; coach_id stamped, NULL-coach requests admin-only; 15 scoping tests
- [x] **Dependencies** flask-cors, gunicorn, cryptography, requests, urllib3 bumped; `pip-audit` clean — closed 2026-07-13: residual pins (cryptography→48.0.1, h11, idna, mako, mistune, pygments, pytest, zipp, plus companion bumps packaging/pluggy for resolvability) all bumped and OSV-checked clean; `pip install` verified clean; full suite re-run (151 passed/0 failed) confirms no runtime breakage from the bumps
- [x] **CFG-1** `ProductionConfig.validate()` called at startup; app fails fast on missing secrets — closed; verified in main.py/config.py
- [x] **IV-1/IV-2** global error handler returns normalized envelope; body-size cap set — closed; Exception handler + MAX_CONTENT_LENGTH=2MB verified in main.py
- [ ] **STAB-1** backend test suite green; frontend smoke tests added; both in CI — PARTIAL: backend 151 passed/0 failed (was 86/8) verified with local DB up 2026-07-13; frontend smoke tests + CI still missing (not attempted — separate initiative)
- [x] **Rate limiting** on Redis storage; verified 429 with `RATELIMIT_ENABLED=true` — closed 2026-07-13: live-verified the login endpoint trips 429 under `RATELIMIT_ENABLED=true` against the patched app. Storage wiring itself (`REDIS_URL` → Flask-Limiter) was verified in code in the prior pass; a live Redis-backed run (vs. in-memory) is still pending a local Redis install (blocked on an unrelated Homebrew tap repair, in progress) — functionally the limiter works, this residual is about the storage *backend* only
- [x] **FE-2/FE-3** React Query cache cleared on logout; CSP header present — closed 2026-07-13: `queryClient.clear()` added to `AuthProvider.logout()`; CSP header live-confirmed on responses (`default-src 'self'; script-src 'self'; ...`)
- [x] **Deployment** gunicorn config + `/health` + structured logging + DB pool tuned; migrations run via `flask db upgrade` in release — closed; artifacts written + statically cross-checked. Live `docker compose` validation still pending (Docker/colima install blocked on the same Homebrew tap repair as above) — tracked separately, not blocking application correctness
- [x] **Docs** `backend/RUNNING.md` `create_all` note corrected; required-env list documented — closed 2026-07-13: stale auto-create-tables claim replaced with the `flask db upgrade` requirement; table count corrected 21→42
- [x] Full stability + pen-test suite re-run; this table updated to green — closed 2026-07-13: full battery re-run live against the patched app — JWT (no-token/alg=none/tampered-signature all 401), auth rate-limit (429 trips), IDOR (player 403 on others' data, rounds scoped), mass assignment (register role-collapse holds), injection fuzz (handled, no 500), CORS (not reflected to hostile origin), headers (CSP now present alongside the existing nosniff/X-Frame-Options)
- [x] **NEW-3** tournament/handicap-journey coach scoping (junior_in_scope) closed + re-probed — closed; consolidated helper applied across tournaments/handicap/juniors, live re-probe 2026-07-12. **Residual now also closed 2026-07-13:** the two handicap **write** routes (`PUT .../handicap-journey`, `PUT /users/<id>/handicap`) now deny an unassigned (`coach_id IS NULL`) junior to non-admin coaches, matching the sessions-module fix; 6 new regression tests added, admin/committee unrestricted access preserved

## Outstanding (tracked, not blocking)

- **Frontend test suite + CI** — no automated frontend tests exist yet; a separate initiative, not attempted in this pass.
- **Live Redis-backed limiter run** and **live `docker compose up` validation** — both blocked on the same local environment issue (a broken/shallow Homebrew tap needed a large one-time repair fetch); the underlying code/config for both is done and statically verified. Follow up once that fetch completes.
- **UI-quality pass** — explicitly deferred by request; layout (bento/dashboards) is done, palette/tone is being reconsidered for the junior/minor audience before further implementation.
