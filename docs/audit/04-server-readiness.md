# Workstream 4 — Server / Deployment Readiness Audit

**Scope:** Karen Golf platform — Flask backend (`backend/`) + React/Vite frontend (`frontend/`).
**Date:** 2026-07-07
**Nature:** Findings only. No application code was changed. All claims cite `file:line`.

**Overall verdict:** The app is **not deployment-ready**. The domain code and migration chain are in good shape, but the *deployment envelope* is almost entirely absent: no WSGI process config, no containers, no health check, no startup validation, no structured logging, no DB pool tuning, and an unfinished production security-header story. Nothing here requires backend logic changes — these are packaging/ops gaps.

---

## Assessment

### 1. Production config selection

**What exists**
- Three config classes: `TestingConfig`, `DevelopmentConfig`, `ProductionConfig` (`backend/config.py:12,23,37`).
- The active class is chosen from `APP_SETTINGS`, defaulting to Development: `config_filename = os.environ.get("APP_SETTINGS", "config.DevelopmentConfig")` (`backend/main.py:40`), applied via `app.config.from_object(...)` (`backend/main.py:43`).
- `.env.example` documents the switch and its allowed values (`backend/.env.example:7-8`).
- **DEBUG is off in prod:** `ProductionConfig.DEBUG = False` with a "NEVER True in production" comment (`backend/config.py:38`).
- **Rate limiting is forced on in prod:** `RATELIMIT_ENABLED = _env_flag("RATELIMIT_ENABLED", True)` — the default is `True` and the comment states "env can't weaken it below this default" (`backend/config.py:42-43`). Note the mechanism actually *can* be weakened: `_env_flag` returns whatever the env var says, so `RATELIMIT_ENABLED=false` in the environment would still disable it (`backend/config.py:4-9`). The "can't weaken" claim is only true if the env var is left unset.

**The gap — `validate()` is never called (confirmed)**
- `ProductionConfig.validate()` exists to fail fast on missing `SECRET_KEY` / `DATABASE_URI` (`backend/config.py:45-52`).
- Grep across the whole backend shows the **only** reference to it is its own `def` at `backend/config.py:46`. It is **not** called in `backend/main.py`, `backend/manage.py`, or anywhere else. Confirmed: **`validate()` is dead code — production can boot with missing secrets.**
- With `SECRET_KEY = os.environ.get("SECRET_KEY")` unset (`backend/config.py:40`), Flask/JWT would run with `SECRET_KEY = None`, breaking token signing at runtime instead of at boot.

**Recommendation**
- Call `ProductionConfig.validate()` inside `create_app()` when the selected config is Production — e.g. after `app.config.from_object(...)` (`backend/main.py:43`), guard on `config_filename == "config.ProductionConfig"` and call `validate()`. This is a one-line ask-first change (touches `main.py`, outside this findings-only workstream).
- Consider hardening `_env_flag` for the rate-limit case so prod cannot be silently disabled, or drop the env override entirely in `ProductionConfig`.

---

### 2. WSGI serving

**What exists**
- `gunicorn==20.1.0` is pinned (`backend/requirements.txt:31`).
- The app object is importable as `main:app` — `app = create_app()` at module scope (`backend/main.py:112`).
- **No gunicorn config file** anywhere (`find` for `gunicorn*`, `Procfile`, `*.wsgi` returned nothing).
- The only documented start command is the **dev server**: `python main.py` → `app.run(host="0.0.0.0", port=5000, debug=True)` (`backend/main.py:114-115`; `backend/RUNNING.md:33,40`). `debug=True` is hardcoded in the `__main__` block, so running `python main.py` in prod would enable the Werkzeug debugger regardless of `APP_SETTINGS`. Production must **not** use this path.

**Version mismatch to flag**
- `uvicorn==0.20.0` is also pinned (`backend/requirements.txt:74`). **Uvicorn is an ASGI server; this app is Flask/WSGI.** Uvicorn cannot serve `main:app` without an ASGI shim (`WsgiToAsgi`), and none is present. This dependency is dead weight / misleading and should be removed from `requirements.txt`. `h11==0.14.0` (`backend/requirements.txt:32`) is likely only present as a uvicorn transitive dep.
- `gunicorn==20.1.0` is old (20.x line). Consider bumping to a current 22.x/23.x for security fixes, tested against Flask 3.1.

**Recommended gunicorn settings & start command**
- Workers: `(2 × CPU) + 1` (start with 3 on a 1-vCPU box), `sync` worker class (the app is synchronous, blocking psycopg2).
- Timeout: `--timeout 60` (CSV import / summary endpoints can be slow); `--graceful-timeout 30`; `--keep-alive 5`.
- Bind behind the reverse proxy on loopback: `--bind 127.0.0.1:5000` (nginx terminates TLS in front).
- Logging: `--access-logfile - --error-logfile -` to stdout/stderr for container/journald capture.
- Start command:
  ```
  APP_SETTINGS=config.ProductionConfig \
    gunicorn "main:app" \
    --workers 3 --worker-class sync \
    --bind 127.0.0.1:5000 \
    --timeout 60 --graceful-timeout 30 --keep-alive 5 \
    --access-logfile - --error-logfile -
  ```
- Prefer a committed `gunicorn.conf.py` over long CLI flags so settings are versioned. (Ask-first: creating this file.)

---

### 3. Containerization

**What exists**
- **Nothing.** `find` for `Dockerfile*`, `docker-compose*`, `*.dockerfile` across the repo (excluding `node_modules`) returned **zero results**. There is also no `.devcontainer/` at repo root or in `backend/` despite `RUNNING.md:109` referencing one (that file appears to be from a different Gitpod workspace, not this repo).

**Recommendation:** Add containers — they eliminate the "works on Gitpod" drift and give a repeatable release. This is an **ask-first** item per the working agreement (adds deployment infrastructure); do not create the files without approval. Sketches below are for discussion, not to be committed yet.

- **Backend Dockerfile (sketch):** `python:3.12-slim` base → install build deps for `psycopg2-binary` (or switch to `psycopg2-binary` which needs none) → `pip install -r requirements.txt` → copy app → `CMD ["gunicorn", "main:app", "-c", "gunicorn.conf.py"]`. Run as non-root.
- **Frontend multi-stage build (sketch):**
  - Stage 1 (`node:20-alpine`): `npm ci` → `npm run build` → emits `dist/`.
  - Stage 2 (`nginx:alpine`): copy `dist/` to the web root, add an nginx conf with SPA fallback (`try_files $uri /index.html`) and gzip.
- **docker-compose (sketch, 3 services):**
  - `db`: `postgres:16`, named volume for `/var/lib/postgresql/data`, `POSTGRES_*` env, healthcheck `pg_isready`.
  - `backend`: build `./backend`, `depends_on: db (healthy)`, env `APP_SETTINGS=config.ProductionConfig`, `DATABASE_URI`, `SECRET_KEY`, `FRONTEND_URL`; release/entrypoint runs `flask db upgrade` before gunicorn.
  - `frontend`: build `./frontend`, serve on 80/443, proxy `/api` to `backend` (or point `VITE_API_BASE` at the API origin at build time).

---

### 4. Migrations in production

**What exists (good)**
- Full Alembic/Flask-Migrate setup present: `backend/migrations/` with `alembic.ini`, `env.py`, `script.py.mako`, and a populated `versions/` directory (**21 revision files**, including baseline `94e5c8f92486_baseline_schema_all_domains_incl_.py`). `env.py` is standard Flask-Migrate wiring (`backend/migrations/env.py:1-113`).
- `flask db upgrade` is the documented workflow (`backend/manage.py:1-19` docstring; `backend/main.py:58` "all envs: flask db upgrade").
- **`create_all` is confirmed gone from application code.** Grep shows `create_all`/`drop_all` appear **only** in `backend/tests/conftest.py:19-20` (test fixtures — correct) and in comments (`backend/main.py:58,65,67`). The dev auto-create path was retired 2026-06-10 (`backend/main.py:64-67`).
  - Caveat: `backend/RUNNING.md:76-78` still claims "The dev server auto-creates all 21 tables on startup (`db.create_all()` when `debug=True`)" — this is **stale documentation** contradicting the code. Update it to avoid confusion.

**Release step (documented for prod)**
- The release/pre-start step **must** be `flask db upgrade` (equivalently `alembic upgrade head`), run once per deploy **before** starting gunicorn, from `backend/` with `APP_SETTINGS=config.ProductionConfig` and `FLASK_APP=manage.py` (or `main.py`).
  ```
  APP_SETTINGS=config.ProductionConfig FLASK_APP=manage.py flask db upgrade
  ```
- Never rely on `create_all`. In a container, make this the entrypoint's first step (fail the deploy if it errors).

---

### 5. Secrets & environment

**Required variables (production)**
| Var | Required | Read at | Notes |
|-----|----------|---------|-------|
| `APP_SETTINGS` | Yes | `backend/main.py:40` | Must be `config.ProductionConfig` in prod (default is Development). |
| `SECRET_KEY` | Yes | `backend/config.py:40` | No fallback in Production — JWT/session signing key. |
| `DATABASE_URI` | Yes | `backend/config.py:41` | No fallback in Production. |
| `FRONTEND_URL` | Yes (effectively) | `backend/main.py:50` | Comma-separated CORS allow-list; defaults to `http://localhost:3000` if unset — wrong for prod, so must be set. |
| `TEST_DATABASE_URI` | No (tests only) | `backend/config.py:16` | Only used under TestingConfig. |
| `RATELIMIT_ENABLED` | No | `backend/config.py:43` | Leave **unset** in prod so the `True` default holds. |

**What `.env.example` documents**
- `backend/.env.example` documents `APP_SETTINGS`, `SECRET_KEY` (with a `secrets.token_hex(32)` generator hint, `:11`), `DATABASE_URI`, `TEST_DATABASE_URI`, and `FRONTEND_URL`. Good coverage. It does **not** mention `RATELIMIT_ENABLED` (fine — leave default) and does not warn that `FRONTEND_URL` unset silently falls back to a localhost origin.
- `frontend/.env.example` documents `VITE_API_BASE` (empty in dev; set to the API origin for a split-origin prod) (`frontend/.env.example:11`).

**Key rotation note**
- Rotating `SECRET_KEY` **invalidates all live JWTs immediately** (8-hour access tokens, `backend/main.py:44`), forcing every user to re-login. There is no refresh endpoint, so rotation is a hard logout for everyone — schedule it for a low-traffic window. Store secrets in the platform's secret manager (not in a committed `.env`); `.env` is correctly flagged "NEVER commit" (`backend/.env.example:3`).

---

### 6. Networking, TLS & security headers

**Reverse proxy / HTTPS**
- No proxy config is in the repo. Deployment assumes an nginx (or platform LB) in front terminating HTTPS and forwarding to gunicorn on `127.0.0.1:5000`. gunicorn should trust `X-Forwarded-*` (`--forwarded-allow-ips`) so `get_remote_address` (rate limiter, `backend/app/utils/limiter.py:3`) sees the real client IP rather than the proxy's.

**Security headers set in `main.py` (`_add_security_headers`, `backend/main.py:70-78`)**
- ✅ `X-Content-Type-Options: nosniff` (`:71`)
- ✅ `X-Frame-Options: DENY` (`:72`)
- ✅ `Referrer-Policy: strict-origin-when-cross-origin` (`:73`)
- ✅ `Strict-Transport-Security: max-age=31536000; includeSubDomains` — correctly **prod-only**, gated on `if not app.debug` (`backend/main.py:74-75`). Note: this depends on `DEBUG=False`, which Production sets (`backend/config.py:38`); the dev `python main.py` path uses `debug=True` so HSTS is correctly suppressed there.

**Missing headers**
- ❌ **No `Content-Security-Policy`.** For an SPA this is the biggest missing header. Recommend a CSP served on the *frontend* (nginx) response, not the API, since the API returns JSON. At minimum `default-src 'self'` tuned for the built assets.
- ❌ No `Permissions-Policy` (optional but cheap; lock down geolocation/camera/etc.).
- ❌ HSTS lacks `preload` (only add once you're certain all subdomains are HTTPS-forever).
- Consider `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` on the frontend.

**gzip / compression**
- Not handled by Flask. Enable gzip (or brotli) at nginx for JSON responses and static assets.

**Swagger exposure**
- ✅ Confirmed gated out of production: the Swagger blueprint is only registered `if os.environ.get("APP_SETTINGS") != "config.ProductionConfig"` (`backend/main.py:101-107`). In prod, `/swagger` returns 404. Good.

---

### 7. Ops readiness

| Concern | Status | Evidence |
|---------|--------|----------|
| **Health endpoint** | ❌ Missing | Grep for `health`/`healthz`/`ping`/`liveness`/`readiness` across `backend/` found only unrelated domain comments (`backend/app/handicap/controllers.py:202,207`). No `/health` route. `RUNNING.md:120` uses `/swagger/` as a liveness proxy — but that's disabled in prod, so **prod has no liveness/readiness probe at all.** |
| **Structured logging** | ❌ Missing | No `logging.dictConfig`/`basicConfig`/app logger setup. Only ad-hoc `logging.info` in `backend/base_model.py:57` and an `import logging` in `backend/app/utils/decorators.py:16`. No JSON logs, no request logging, no correlation IDs. Prod would rely solely on gunicorn access logs. |
| **DB connection pooling** | ❌ Not configured | No `SQLALCHEMY_ENGINE_OPTIONS`, `pool_size`, `pool_pre_ping`, `pool_recycle`, or `max_overflow` anywhere (grep empty). Uses SQLAlchemy defaults (pool size 5). **Missing `pool_pre_ping=True` risks stale-connection errors** after Postgres/idle timeouts — a common prod failure. |
| **Request timeouts** | ❌ App-level none | Rely on gunicorn `--timeout` (see §2). No per-request or DB statement timeout. |
| **Graceful shutdown** | ⚠️ Via gunicorn only | The dev `app.run` path has none; gunicorn's `--graceful-timeout` covers it once adopted. |
| **Backup / restore** | ❌ Not documented | No `pg_dump`/restore runbook anywhere in `backend/` or `docs/`. Needs a documented, scheduled backup for the Postgres volume before go-live. |
| **Rate limiting** | ✅ Present | `limiter` initialised (`backend/main.py:59`), applied to auth (`@limiter.limit("10 per hour; 3 per minute")` register `backend/app/auth/routes.py:48`; `"20 per hour; 5 per minute"` login `:78`). Note storage backend is in-memory (default) — **rate limits are per-process**; with multiple gunicorn workers each worker has its own counters, so effective limits multiply by worker count. For accurate global limits, configure a shared store (e.g. Redis) via `RATELIMIT_STORAGE_URI`. |

**Recommendations:** add a lightweight `GET /api/health` (returns 200 + a cheap `SELECT 1` for readiness); add `logging.dictConfig` emitting JSON to stdout; set `SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 1800}`; document a `pg_dump` backup cron. All are ask-first code/config changes.

---

### 8. Frontend hosting

- **Build:** `npm run build` = `tsc -b && vite build` (`frontend/package.json:9`). Vite's default output dir is **`frontend/dist/`** (no `outDir` override in `vite.config.ts`). Serve `dist/` as static files.
- **API base handling:** `const BASE = import.meta.env.VITE_API_BASE ?? ''` (`frontend/src/lib/api.ts:18`), and every request is `fetch(BASE + path + buildQuery(...))` (`frontend/src/lib/api.ts:118`). So:
  - **Same-origin prod (recommended):** leave `VITE_API_BASE` empty (`frontend/.env.example:11`) and have nginx reverse-proxy `/api/*` on the frontend origin to gunicorn. No CORS, mirrors dev. The Vite dev proxy (`frontend/vite.config.ts:16-21`) only applies to `npm run dev` — it does **not** exist in the built output, so a same-origin prod needs the equivalent nginx `location /api { proxy_pass ... }`.
  - **Split origin:** set `VITE_API_BASE=https://api.yourdomain.com` **at build time** (Vite inlines env vars into the bundle), and add that origin to backend `FRONTEND_URL` for CORS (`backend/main.py:50`). Remember `VITE_*` vars are baked at build — changing the API origin means a rebuild, not just an env change.
- **SPA fallback routing (required):** the app uses React Router (client-side routes). The static host **must** rewrite unknown paths to `/index.html` (nginx `try_files $uri /index.html;`), or deep-links / refreshes on any non-root route 404. This is not configured anywhere yet.
- **Cache headers:** Vite emits content-hashed asset filenames in `dist/assets/`, so serve those with `Cache-Control: public, max-age=31536000, immutable`, but serve `index.html` with `no-cache` (must be revalidated so new deploys are picked up). Not configured yet.

---

## GO-LIVE CHECKLIST

- [ ] Call `ProductionConfig.validate()` at startup so missing `SECRET_KEY`/`DATABASE_URI` fail the boot, not a later request (`backend/config.py:45-52` is currently never invoked).
- [ ] Set production env: `APP_SETTINGS=config.ProductionConfig`, a strong random `SECRET_KEY`, real `DATABASE_URI`, and `FRONTEND_URL` = the real frontend origin(s); leave `RATELIMIT_ENABLED` unset.
- [ ] Remove `uvicorn==0.20.0` (ASGI, unused) from `requirements.txt`; bump `gunicorn` off the 20.1.0 line to a current release.
- [ ] Add a versioned `gunicorn.conf.py` (sync workers, `--timeout 60`, graceful timeout, bind `127.0.0.1:5000`, logs to stdout) and serve prod with gunicorn — **never** `python main.py` (`debug=True` is hardcoded at `main.py:115`).
- [ ] Make `flask db upgrade` (`APP_SETTINGS=config.ProductionConfig`) the mandatory pre-start release step on every deploy; block the deploy if it fails.
- [ ] Add a `GET /api/health` endpoint (200 + `SELECT 1`) and wire it to the platform's liveness/readiness probe (Swagger is 404 in prod, so it can't be the probe).
- [ ] Configure DB pooling: `SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 1800}` to survive dropped connections.
- [ ] Add structured (JSON) application logging to stdout via `logging.dictConfig`; keep gunicorn access/error logs on stdout/stderr.
- [ ] Move rate-limit storage to a shared backend (`RATELIMIT_STORAGE_URI`, e.g. Redis) so limits are global across gunicorn workers, not per-process.
- [ ] Stand up a reverse proxy (nginx) terminating HTTPS; forward `X-Forwarded-*` and set gunicorn `--forwarded-allow-ips` so the rate limiter sees real client IPs.
- [ ] Add a `Content-Security-Policy` (and `Permissions-Policy`) on the frontend responses; confirm HSTS is emitted in prod (`main.py:74-75`, depends on `DEBUG=False`).
- [ ] Enable gzip/brotli at the proxy for JSON + static assets.
- [ ] Confirm `/swagger` is unreachable in prod (already gated at `main.py:101`) and spot-check it returns 404 after deploy.
- [ ] Build the frontend with `npm run build`; serve `frontend/dist/` with SPA fallback (`try_files $uri /index.html`) and content-hash cache headers (immutable assets, no-cache `index.html`).
- [ ] Decide same-origin vs split-origin API: if same-origin, add nginx `location /api → gunicorn`; if split-origin, set `VITE_API_BASE` at build time and add the origin to backend `FRONTEND_URL`.
- [ ] (Ask-first) Add Dockerfiles (backend + multi-stage frontend) and a docker-compose (db/backend/frontend) for a repeatable release; run migrations in the backend entrypoint.
- [ ] Document and schedule automated Postgres backups (`pg_dump`) with a tested restore procedure before go-live.
- [ ] Fix stale docs: `backend/RUNNING.md:76-78` still claims dev `create_all` auto-creates tables — code retired it (`main.py:64-67`); update to the `flask db upgrade` flow.
- [ ] Smoke test each role end-to-end against the production stack (register/login → dashboard → one data screen) after cutover.
