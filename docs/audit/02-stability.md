# 02 — Code-Stability Test

**Audit:** Production-readiness, Phase 1 (findings only). **Date:** 2026-07-07.
**Environment:** macOS (darwin), Python 3.13.14, Node v24.18.0. A throwaway
`karen_test_db` on a local Postgres 16 is used for the backend suite; no real data.

---

## Frontend — `npm ci` / type-check / lint / build → **GREEN**

Run in `frontend/` (Node 24, npm 11):

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm ci` | ✅ 235 pkgs, **0 vulnerabilities**, no peer-dep conflicts |
| Type check | `npm run type-check` (`tsc -b --noEmit`) | ✅ **0 errors** |
| Lint | `npm run lint` (`eslint .`) | ✅ 0 errors, **2 warnings** |
| Build | `npm run build` (`tsc -b && vite build`) | ✅ success, ~5.6s vite / ~14.5s wall |
| Audit | `npm audit` (prod + full) | ✅ **0 vulnerabilities** |

**Warnings / pre-production flags (non-blocking):**
- **Lint (2 warnings, same rule):** `react-refresh/only-export-components` at
  `frontend/src/features/participant/participant.tsx:27,33` — the module exports
  `PARTICIPANT_TYPES` and `participantLabel` alongside components, breaking Fast Refresh.
  Cosmetic; move the non-component exports to a sibling file.
- **Bundle size:** the production JS chunk is **1.52 MB (388.9 kB gzip)** — 3× over Vite's
  500 kB warning threshold, single monolithic chunk, no code-splitting / `manualChunks` /
  dynamic `import()`. Add route-level `React.lazy` + `manualChunks`.
- **Unoptimized assets:** two hero JPGs shipped raw — `01-course-sunset` (1.16 MB) and
  `02-clubhouse-aerial` (0.79 MB), ~1.9 MB combined. Compress / serve responsive sizes.
- **No engines field** in `package.json` — Node version is unconstrained; pin an `engines.node`.

**Frontend has ZERO automated tests.** No `test` script, no vitest/jest in devDependencies,
no `*.test.*`/`*.spec.*` files anywhere in `src/`. This is a stability risk for a UI whose
correctness (band-conditional evaluation form, SI-based strokes-received display, role guards)
is exactly the "looks right vs. is right" surface `CLAUDE.md` calls out. Recommend Vitest +
React Testing Library, starting with the api client, role guards, and the evaluation form.

---

## Backend — dependency CVEs (`pip-audit` on `requirements.txt`)

`pip-audit` reports **known vulnerabilities in ~15 pinned packages**. The pins are 2021–2023
era; several are production-facing. Highlights (package · current → fixed-in · sample IDs):

| Package | Pinned | Fixed in | Severity note |
|---------|--------|----------|---------------|
| **flask-cors** | 3.0.10 | 6.0.0 | **HIGH** — 8 advisories incl. CORS-bypass (PYSEC-2024-71/260/271, PYSEC-2026-1383/1384/1385). Prod CORS control. |
| **gunicorn** | 20.1.0 | 22.0.0 | **HIGH** — request smuggling (PYSEC-2026-1433/1434). This is the prod WSGI server. |
| **cryptography** | 39.0.1 | 46.0.6 | **HIGH** — 14 advisories (PYSEC-2023-254, PYSEC-2024-225, GHSA-*, CVE-2026-26007). |
| **requests** | 2.26.0 | 2.33.0 | HIGH — PYSEC-2023-74 (cert leak), CVE-2026-25645, PYSEC-2026-1872/1873. |
| **urllib3** | 1.26.12 | 2.5.0+ / 1.26.19 | HIGH — 9 advisories (redirect/auth leakage). |
| **jinja2** | 3.1.2 | 3.1.6 | MED — 5 advisories (sandbox/template). |
| **flask-httpauth** | 4.7.0 | 4.8.1 | MED — CVE-2026-34531. |
| **mako** | 1.2.4 | 1.3.12 | MED — CVE-2026-44307 (pulled by flasgger, dev/docs path). |
| **mistune** | 2.0.4 | 3.2.1 | MED — 3 advisories (pulled by flasgger). |
| **marshmallow** | 3.18.0 | 3.26.2 | MED — PYSEC-2026-1605. |
| **python-dotenv** | 0.21.0 | 1.2.2 | MED — CVE-2026-28684. |
| **pygments** | 2.14.0 | 2.20.0 | LOW/MED. |
| **idna** | 3.4 | 3.15 | LOW. |
| **h11** | 0.14.0 | 0.16.0 | LOW (pulled by uvicorn — see below). |
| **zipp** | 3.11.0 | 3.19.1 | LOW. |
| **pytest** | 7.2.0 | 9.0.3 | LOW (dev-only). |

**Recommendation:** bump at minimum the four production-facing HIGHs (flask-cors, gunicorn,
cryptography, requests/urllib3) before go-live; then a full dependency refresh + re-run
`pip-audit` in CI. Note the full pin set *does* install on Python 3.13 (install exit 0), so
these bumps are low-friction.

**Dead / unused dependencies to drop** (extra attack surface, no app import — see
`05-maintainability.md`): `AWSIoTPythonSDK`, `Flask-Script` (Py2-era, deprecated),
`Flask-RESTful`, `Flask-HTTPAuth`, `codeclimate-test-reporter`, `coveralls`, and `uvicorn`
(ASGI server, unusable by this WSGI app — see `04-server-readiness.md`).

---

## Migrations

- Alembic is wired via Flask-Migrate (`backend/main.py:58`); the migration chain is **21
  revisions** under `backend/migrations/versions/`. `db.create_all()` is confirmed **gone from
  application code** (only present in test fixtures) — prod applies schema via `flask db
  upgrade`, per `main.py:62-67`.
- **Stale doc:** `backend/RUNNING.md:76-78` still claims dev auto-creates tables via
  `create_all` on startup — the code retired that. Fix the runbook.
- A from-empty `alembic upgrade head` and a spot downgrade are exercised below with the live DB.

---

## Backend — test suite / coverage / migrations (live)

Run with `APP_SETTINGS=config.TestingConfig` against a fresh `karen_test_db` on local
Postgres 16 (`pytest -q --cov=app`).

**Result: `8 failed, 86 passed` in 92s. App coverage: 46%.**

### The 8 failures are test debt, not new bugs (STAB-1, Medium)

All 8 failures are in `tests/test_evaluations_signoff.py` (6) and `tests/test_access_scoping.py`
(2: `test_staff_read_any_junior_progress`, `test_staff_read_any_junior_badges`). They fail
because they assert the **pre-June-hardening** looser behavior:

- The `make_junior` fixture (`tests/conftest.py:63-78`) creates a junior with **no `coach_id`**.
- The June H-2/H-3 fixes now require a coach to *own* a junior to evaluate or read their
  progress. So the endpoints correctly return **403** ("Coaches can only evaluate their own
  juniors"), but the tests still `assert 201`/`assert 200`.

So the *code* is behaving correctly (more securely); the *tests* were never updated when the
security fix landed. **Net effect: the committed backend suite does not pass as-is — CI would be
red and the regression safety net is degraded.** This is exactly the kind of drift that lets a
real regression hide among "known" failures.
**Fix:** update the fixtures/tests to the post-hardening contract — either have `make_junior`
accept/assign a `coach` and pass the logged-in coach, or assert 403 for the unassigned case and
add a positive test with an assigned coach. Get the suite green, then keep it green in CI.

### Coverage is thin (46%) and uneven

High-risk modules are under-covered: `app/rounds/controllers.py` **20%**, `app/whs/routes.py`
**31%** (WHS engine — the crown jewel), `app/sessions/*` **19–30%**, `app/messaging/*`
**20–21%**, `app/league/*` **17–26%**, `app/juniors/routes.py` **45%**. Fully uncovered dead
code shows up too: `app/schemas/golf.py` **0%**, `app/schemas/user.py` **0%**,
`app/utils/responses.py` **0%** (see the dead-code note in `05-maintainability.md`). Tournaments
scoring is well covered (93%). Overall the suite tests happy-path envelopes more than the IDOR/
mass-assignment paths that `01-security.md` flags — the security-critical handlers are the least
tested.

### Warnings

The run emits **2,572 warnings** — predominantly deprecation warnings (naive `datetime`/UTC,
PyJWT encode/decode, SQLAlchemy). Not failures, but noise that hides real signal and will become
errors on future dependency bumps. Worth a cleanup pass alongside the dependency refresh.

### Migrations (verified live)

`flask db upgrade` from an **empty** `karen_db` ran the full chain cleanly to head
(`q19leaguewiring`) and produced **42 tables** (the "21 tables" figure in `backend/RUNNING.md`
is stale). `db.create_all()` is confirmed absent from application code. Migration chain is
healthy.

---

## Error handling & startup (static observations)

- **No global error handler** (IV-1 in `01-security.md`): unguarded `int()`/date casts can
  surface as bare Flask 500s rather than the normalized `{error:{code,message}}` envelope. The
  WHS routes wrap their casts and are the good counter-example. Add an app-level handler.
- **No `MAX_CONTENT_LENGTH`** (IV-2): request bodies are unbounded.
- **Startup does not fail fast:** `ProductionConfig.validate()` exists (`config.py:45-52`) but
  is **never called** (`main.py`), so a prod boot with a missing `SECRET_KEY`/`DATABASE_URI`
  fails at first use instead of at startup (CFG-1). See `04-server-readiness.md`.
- **Logging is ad-hoc** — no structured logging configured; nothing writes request/error logs
  in a parseable format. Add structured logging before prod.
