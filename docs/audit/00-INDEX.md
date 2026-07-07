# Production-Readiness Audit — Index & Summary

**Project:** Karen Golf Management Platform (Flask backend + React/Vite/TS frontend)
**Branch:** `audit/production-readiness` **Date:** 2026-07-07
**Phase:** 1 — **findings only, no application code changed.**
**Method:** static review + dependency scanning + **live probing of a local instance only**
(no remote/production host was contacted). Backend suite + pen test run against a disposable
local Postgres 16 / `karen_db` / `karen_test_db` seeded with demo data.

> **Bottom line: NOT ready for a public server yet.** Two **Critical** object-level-auth holes
> are open and were **reproduced live** — a player can forge a *verified, handicap-affecting*
> round onto any account (incl. the admin), and hole-scores have no ownership gate. Add a coach
> self-counter-signing evaluations, a player editing their own Handicap Index, parents reading
> every family's rounds, ~15 vulnerable backend dependencies, and a deployment envelope that is
> essentially absent (no WSGI config, no health check, no startup validation, no containers).
> The good news: auth/JWT, role decorators, CORS, injection posture, and the June IDOR fixes
> (H-2/H-3/H-4) all **held up under live attack**, and the migration chain is healthy.

## Reports

| File | Workstream | Status |
|------|-----------|--------|
| [01-security.md](01-security.md) | Security pass (static) | ✅ |
| [02-stability.md](02-stability.md) | Build / type / lint / tests / deps / migrations | ✅ |
| [03-pentest.md](03-pentest.md) | Live probing (local instance) | ✅ |
| [04-server-readiness.md](04-server-readiness.md) | Deployment gaps + go-live checklist | ✅ |
| [05-maintainability.md](05-maintainability.md) | Structure, typing, onboarding, how-to guides | ✅ |
| [fixes-changelog.md](fixes-changelog.md) | Phase 2 changes | ⏸ awaiting go-ahead |

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

- [ ] **C-1** hole-scores authorization enforced (read + write) + re-probed
- [ ] **C-2/MA-1** `/rounds` identity stamped, WHS columns server-computed + re-probed
- [ ] **H-1** parent/committee round reads scoped + re-probed
- [ ] **NEW-1** evaluation create strips sign-off fields + re-probed
- [ ] **P-1** `handicap_index`/`membership_number` stripped from self-update + re-probed
- [ ] **H-5r / NEW-2** sessions/booking coach-scoping + null-coach bypass closed
- [ ] **Dependencies** flask-cors, gunicorn, cryptography, requests, urllib3 bumped; `pip-audit` clean
- [ ] **CFG-1** `ProductionConfig.validate()` called at startup; app fails fast on missing secrets
- [ ] **IV-1/IV-2** global error handler returns normalized envelope; body-size cap set
- [ ] **STAB-1** backend test suite green; frontend smoke tests added; both in CI
- [ ] **Rate limiting** on Redis storage; verified 429 with `RATELIMIT_ENABLED=true`
- [ ] **FE-2/FE-3** React Query cache cleared on logout; CSP header present
- [ ] **Deployment** gunicorn config + `/health` + structured logging + DB pool tuned; migrations run via `flask db upgrade` in release
- [ ] **Docs** `backend/RUNNING.md` `create_all` note corrected; required-env list documented
- [ ] Full stability + pen-test suite re-run; this table updated to green
