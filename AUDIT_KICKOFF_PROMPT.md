# Production-Readiness Audit — Kickoff Prompt

> **How to use this file.** Open this repo in your editor, start a Claude Code
> session at the repo root, and paste the block under **"PROMPT — paste this"**
> as your first message. Everything above it is context for you (the human);
> everything inside it is written *to* Claude Code.

---

## Context for you (the human)

This app — the **Karen Golf Management Platform** (Flask API + React/Vite/TS
frontend) — is feature-complete and needs a pass before it goes on a server.
You asked for five things: a **security pass**, a **code-stability test**, a
**pen test**, **readiness for server**, and **ease of adjustment**
(maintainability). This prompt drives all five as one sequenced engagement,
**full-stack**, with **static review + live probing** of a locally-run instance.

Repo conventions the prompt already respects:
- `WORKING_AGREEMENT.md` — how this project wants Claude to work (feature
  branches only, cite file:line, pause on risky changes).
- `CLAUDE.md` is a **locked** contract file — a PreToolUse hook blocks edits to
  it (and to `frontend/src/lib/api.ts`, `frontend/src/types/api.ts`). The audit
  writes findings to **new files**, never into locked ones.
- Five roles — **admin, coach, committee, parent, player** — reading one DB
  through one API. The parent→own-child and player→self data isolation is the
  highest-value target for the access-control testing.

If a Claude Code hook complains during the run, restore local settings once:
`cp .claude/settings.example.json .claude/settings.json && chmod +x .claude/hooks/*.sh`.

---

## PROMPT — paste this

You are running a **production-readiness audit** of this repository before it is
deployed to a server. Work through five workstreams in order. This is a
**full-stack** engagement using **static review plus live probing** of a
locally-run instance.

### Operating rules
- Read `CLAUDE.md`, `WORKING_AGREEMENT.md`, `PROGRESS.md`, `README.md`,
  `backend/RUNNING.md`, and `.claude/docs/` **first** so you understand the
  architecture, the five-role model, and the locked-contract rules before you
  touch anything.
- Work on a branch: `git checkout -b audit/production-readiness`. Never commit
  to `main`. Never edit locked files (`CLAUDE.md`, `frontend/src/lib/api.ts`,
  `frontend/src/types/api.ts`).
- **Phase 1 is findings-only — do not change app code.** Produce the reports,
  show me the severity-ranked summary, and stop for my go-ahead before fixing.
- Every finding must cite **file path + line number** and state **severity**
  (Critical / High / Medium / Low / Info), **impact**, and a **concrete fix**.
- Put all deliverables in `docs/audit/` (create it). Use subagents
  (`api-contract-auditor`, `build-runner`) to keep heavy output out of the main
  thread. Keep a running `docs/audit/00-INDEX.md` linking every report.
- **Live probing targets the local instance ONLY.** Never scan, probe, or send
  traffic to any remote/production host. Treat the DB as disposable; use a
  throwaway `karen_test_db`, never real data.

### Deliverables (write these files)
```
docs/audit/00-INDEX.md              ← summary + severity table + links + sign-off checklist
docs/audit/01-security.md           ← static security findings
docs/audit/02-stability.md          ← test/build/type/migration results
docs/audit/03-pentest.md            ← live probing results (with request/response evidence)
docs/audit/04-server-readiness.md   ← deployment gaps + a go-live checklist
docs/audit/05-maintainability.md    ← structure, onboarding, "how to add X"
docs/audit/fixes-changelog.md       ← what you changed in Phase 2, why, and how you verified
```

---

### Workstream 1 — Security pass (static)
Review backend and frontend for:
- **AuthN / JWT** — token signing, expiry (access 8h / refresh 7d — right?),
  refresh handling, logout/revocation, `SECRET_KEY` sourcing, algorithm
  confusion, whether any route is unintentionally unauthenticated.
- **AuthZ / RBAC** — every route decorated for the correct role; verify the
  server *enforces* role, not just the UI. Map each `@jwt_required` + role check
  against the five-role rules in `CLAUDE.md`.
- **Object-level authorization (IDOR)** — the big one. Confirm a **parent can
  only reach their own child**, a **player only themselves**, a **coach only
  assigned juniors**. Look for any handler that trusts an ID from the URL/body
  without an ownership check. Cross-reference `backend/tests/test_access_scoping.py`
  and `test_player_self.py` and note gaps.
- **Injection** — raw SQL / f-string queries in SQLAlchemy, unparameterized
  `text()`, unsafe `openpyxl`/file handling, path traversal on any upload/static.
- **Input validation** — marshmallow schemas on every write; mass-assignment /
  over-posting (can a user set `role`, `is_admin`, foreign keys they shouldn't?).
- **Secrets & config** — no hardcoded secrets; `.env` gitignored; production
  config fails closed when `SECRET_KEY`/`DATABASE_URI` missing (see
  `config.py::ProductionConfig.validate`); debug off in prod.
- **Transport & headers** — CORS origin allow-list correctness, missing security
  headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP), cookie flags if
  cookies are used.
- **Rate limiting** — Flask-Limiter coverage on auth endpoints; is it actually
  on in production config?
- **Passwords** — bcrypt cost, timing, password policy, reset-token entropy.
- **Dependency CVEs** — run `pip-audit` (or `safety`) on `backend/requirements.txt`
  and `npm audit` on `frontend/`. Flag pinned-but-vulnerable packages.
- **Frontend** — token storage (localStorage vs memory/httpOnly), XSS via
  `dangerouslySetInnerHTML`, secrets leaked into the Vite bundle (only `VITE_*`
  is exposed — confirm nothing sensitive is), and that all calls go through
  `src/lib/api.ts`.

### Workstream 2 — Code-stability test
- Backend: create/point at `karen_test_db`, run `pytest -q --cov=app` from
  `backend/`. Report pass/fail, coverage %, slow/flaky tests, and any module
  with **zero** tests.
- Frontend: `npm ci` then `npm run type-check`, `npm run lint`, `npm run build`.
  Report every error/warning.
- **Migrations** — verify `alembic upgrade head` works from an empty DB and that
  models match migrations (no reliance on `db.create_all()` for prod). Try a
  downgrade where feasible.
- Error handling — unhandled exceptions leaking stack traces, missing try/except
  around external calls, consistent error envelope shape.
- Startup — does the app fail fast on bad config? Is logging configured?

### Workstream 3 — Pen test (live, local instance only)
Boot the stack per `backend/RUNNING.md` (Postgres + Flask on :5000, Swagger at
`/swagger/`; frontend on :5173). Then actively probe **your local instance**:
- Hit protected endpoints with **no token**, an **expired token**, a
  **tampered token** (alg=none, wrong signature, swapped claims).
- **Privilege escalation** — log in as `player`/`parent`, then call admin/coach
  endpoints and confirm 403, not 200.
- **IDOR in practice** — as parent A, request parent B's child; as player X,
  request player Y's scores/handicap. Prove the isolation holds (or doesn't).
- **Auth brute-force** — hammer `/login` to confirm the rate limiter trips (429)
  with `RATELIMIT_ENABLED=true`.
- **Mass assignment** — POST extra fields (`role`, `is_admin`, `id`) on
  register/profile-update and confirm they're ignored.
- **Injection fuzzing** — SQL/`'`/`;`/unicode and oversized payloads on search
  and ID params; malformed JSON; wrong content-types.
- **CORS** — preflight from a disallowed origin should not be reflected.
- **Info leakage** — verbose 500s, Swagger exposing internals, server/version
  headers, stack traces.
Capture request + response evidence (redact any token values — paths/status only)
for each finding in `03-pentest.md`.

### Workstream 4 — Readiness for server (deployment)
- **Production config** — confirm `ProductionConfig` is selected via
  `APP_SETTINGS`, debug off, `validate()` called at startup, rate limiting on.
- **WSGI serving** — gunicorn is in requirements but there's no config; propose a
  `gunicorn.conf.py` (workers, timeouts, bind) and a documented start command.
  (uvicorn is in requirements though the app is Flask/WSGI — flag the mismatch.)
- **Containerization** — there is **no Dockerfile / docker-compose**. Assess
  whether to add them; if yes, propose backend + frontend + Postgres compose and
  a multi-stage frontend build. Ask before creating.
- **Migrations in prod** — deploy must run `alembic upgrade head`, never
  `create_all`. Document the release step.
- **Secrets & env** — production `.env` strategy, key rotation, and the required
  var list (`SECRET_KEY`, `DATABASE_URI`, `FRONTEND_URL`, `APP_SETTINGS`).
- **Networking** — reverse proxy (nginx) + HTTPS termination assumptions,
  security headers at the proxy, gzip, static/`/swagger` exposure decision
  (should Swagger be public in prod?).
- **Ops** — a `/health` (or `/healthz`) endpoint, structured logging, DB
  connection pooling, timeouts, graceful shutdown, and a backup/restore note.
- **Frontend hosting** — `npm run build` output, `VITE_API_BASE` for a split
  origin, SPA fallback routing, cache headers.
- Output a **go-live checklist** in `04-server-readiness.md` (checkbox per item).

### Workstream 5 — Ease of adjustment (maintainability)
- Module consistency — every `app/<domain>/` follows the same
  routes/models/schemas shape; flag outliers.
- Config centralization, dead code, TODO/FIXME, duplicated logic, oversized files.
- Typing — run `mypy` (it's pinned); report the gap. Docstrings on public funcs.
- Test-coverage gaps mapped to risk (pair with Workstream 2 numbers).
- Write a short **"How to add a new module / endpoint / role-guarded page"**
  guide and a **developer onboarding** section so a new contributor is productive
  fast. Note whether the `.claude/` tooling (agents, hooks, `/new-page`) is
  helping or getting in the way.

---

### Sequencing & gates
1. **Phase 1 (findings-only):** Workstreams 1–5 as reports in `docs/audit/`.
   Present me the `00-INDEX.md` severity table and **stop**.
2. **Phase 2 (fixes):** After I approve, fix **Critical → High → Medium** in
   order. Re-run Workstream 2 checks after each batch. Anything that changes API
   shape, adds a dependency, or creates deploy files (Dockerfile, etc.) — **ask
   first** per `WORKING_AGREEMENT.md`. Log every change in `fixes-changelog.md`.
3. **Phase 3 (verify):** Re-run the full stability + pen-test suite and confirm
   each fixed finding is closed. Update `00-INDEX.md` to green.

Begin now: read the docs listed under Operating rules, create the
`audit/production-readiness` branch and `docs/audit/`, and start Workstream 1.
Do not modify app code until Phase 1 findings are approved.
