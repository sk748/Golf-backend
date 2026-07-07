# 01 — Security Pass (Static)

**Audit:** Production-readiness, Phase 1 (findings only). **Date:** 2026-07-07.
**Scope:** `backend/` (Flask) + `frontend/` (React/Vite/TS), static review.
**Method:** Independent re-verification of the prior `backend/docs/SECURITY_REVIEW.md`
(2026-06-11/12) against the *current* code, plus a fresh sweep. Every finding cites
`file:line`. Nothing was changed.

> **Headline:** The codebase has *improved* since the June review — several High IDOR
> items (H-2, H-3, H-4) and the unauthenticated WHS routes (L-1) are genuinely fixed.
> But the **two Critical object-level-authorization holes remain fully open** (hole-scores
> unscoped; `POST /rounds` forging `user_id` + WHS outputs), a self-service **handicap/
> membership mass-assignment** remains, and the June evaluation-signoff fix was applied to
> the *update* path only — the **create path can still forge both sign-offs** (new finding).
> These are tampering-with-minors'-scores/handicaps issues and should block go-live.

---

## Severity summary (current state)

| Sev | ID | Title | Status vs June |
|-----|-----|-------|----------------|
| **Critical** | C-1 | `hole-scores` fully unscoped (read + write) | STILL PRESENT |
| **Critical** | C-2 / MA-1 | `POST /rounds` forges `user_id` + WHS output columns | STILL PRESENT |
| **High** | H-1 | rounds + handicap-history club-wide readable by parent/committee | STILL PRESENT |
| **High** | NEW-1 | evaluation **create** path can forge both sign-offs | NEW (June fix was update-only) |
| **High** | P-1 | `PUT /users/<id>` self-update sets `handicap_index` / `membership_number` | STILL PRESENT |
| **High** | H-5r | sessions cross-coach cluster (residual: booking-req PUT, arbitrary coach_id, enrollments) | PARTIALLY FIXED |
| **High** | DEP-1 | `Flask-Cors==3.0.10` (pre-4.x CORS-bypass fixes) | STILL PRESENT |
| **High** | DEP-2 | `gunicorn==20.1.0` (pre request-smuggling fixes) | STILL PRESENT |
| **Medium** | NEW-2 | null-`coach_id` bypass on booking approve/decline | NEW (residual of H-5) |
| **Medium** | SEC-1 | Flask-Limiter in-memory storage (multi-worker prod multiplies limits) | STILL PRESENT |
| **Medium** | RL-1 | rate limits only on login/register; many abuse surfaces unthrottled | STILL PRESENT |
| **Medium** | IV-1 | no global error handler; bare 500s on uncaught casts | STILL PRESENT |
| **Medium** | IV-2 | no `MAX_CONTENT_LENGTH` — unbounded request bodies | STILL PRESENT |
| **Medium** | CSV-1 | CSV import has no row/size cap (bcrypt-per-row DoS) | STILL PRESENT |
| **Medium** | FE-2 | React Query cache not cleared on logout (kiosk data bleed) | STILL PRESENT |
| **Medium** | FE-3 | no Content-Security-Policy header anywhere | STILL PRESENT |
| **Medium** | CFG-1 | `ProductionConfig.validate()` is never called at startup | STILL PRESENT |
| **Medium** | DEP-3 | stale `cryptography` / `requests` / `urllib3` / `Jinja2` / `certifi` pins | STILL PRESENT |
| **Low** | FE-1 | JWT in `localStorage` (any XSS = 8h token theft) — accepted-risk | STILL PRESENT |
| **Low** | P-2 | parent-child link by guessable membership number + distinct errors | STILL PRESENT |
| **Low** | SEC-2 | `APP_SETTINGS=config.TestingConfig` usable on a prod host (weak key, limits off) | STILL PRESENT |
| **Low** | CSV-2 | CSV cells stored verbatim → formula injection on future Excel export | STILL PRESENT |
| **Low** | A-1 | no token revocation/denylist (no server-side logout) | STILL PRESENT |
| **Info** | — | register is enumeration-*unsafe* ("email already registered") | STILL PRESENT |

**Fixed since June (verified):** H-2 (evaluations coach scoping), H-3 (junior PII IDOR for
players), H-4 (`PUT /juniors` staff mass-assignment), L-1 (unauthenticated WHS calc routes).
A `backend/docs/SECURITY_AUDIT_2026-06-15.md` documents that remediation round.

Live/dynamic confirmation of C-1, C-2, H-1, P-1, NEW-1 is in `03-pentest.md`.

---

## AuthN / JWT

- JWT Bearer via Flask-JWT-Extended, **HS256 + `SECRET_KEY`**, identity = user email.
  Access token **8h** (`backend/main.py:44`), refresh **7 days** (`main.py:45`) — but there
  is **no refresh endpoint** and the frontend never refreshes, so the 7-day refresh token is
  dead config. This matches the `CLAUDE.md` "no refresh" contract; recommend deleting the
  unused `JWT_REFRESH_TOKEN_EXPIRES` line to avoid implying a flow that doesn't exist.
- Guard primitives (`backend/app/utils/decorators.py:61-90`) re-`verify_jwt_in_request()`,
  **re-load the user by email each request**, and re-check `is_active` + live role — so
  deactivation and role changes take effect immediately. This is a genuine strength.
- **A-1 (Low):** no `jti` denylist / token revocation. There is no server-side logout; a
  stolen 8h token is valid until expiry. Admin changing a user's email silently invalidates
  their token (identity-by-email) — no dangling access, but no forced-logout capability
  either. Direction: document "no server-side logout"; add a `jti` denylist only if forced
  logout becomes a requirement.
- Passwords: **bcrypt** with per-user salt (`backend/app/auth/`), min length 8, no complexity
  rule. Login is enumeration-safe (uniform "Invalid credentials").
- **Info — register is enumeration-unsafe:** register returns distinct "Email already
  registered" / "No parent account found with that membership number" messages, revealing
  account/membership existence. Rate-limited 10/hr, so bounded, but it is a disclosure surface.

## AuthZ / RBAC — decorator coverage is complete

Every data route carries an auth decorator. The **only** unauthenticated handlers are the two
intentionally public endpoints — `GET /api/public/announcements`
(`backend/app/announcements/routes.py:311-312`) and `GET /api/public/league/scoreboard`
(`backend/app/league/routes.py:156-157`) — plus `/swagger` (gated out of prod, `main.py:101`).
The June "3 unguarded WHS calc routes" (L-1) are now guarded
(`backend/app/whs/routes.py:31,58,81`). **No route is unintentionally unauthenticated.**

The systemic problem is **not** missing decorators — it is **object-level authorization inside
`@require_auth` handlers** (IDOR) and **mass-assignment** via raw `schema.load(body)`.

## Object-level authorization (IDOR) — the primary risk

### C-1 (CRITICAL) — hole-scores completely unscoped, read + write
`backend/app/rounds/routes.py:152-181`. `GET /api/hole-scores` (`:152-156`) is `@require_auth`
with no ownership check and, with no `round_id`, returns **every player's per-hole data**.
`POST` (`:159-163`) and `PUT /hole-scores/<id>` (`:175-181`) are `@require_roles("admin",
"player","coach")` with **no round-ownership check**, and the controller
(`backend/app/rounds/controllers.py:69-73`) raw-loads the body. **Any player can read the whole
club's scorecards and overwrite another player's verified hole scores** — directly manipulating
a minor's competitive record and, through re-sync, their handicap.
**Fix:** require round ownership (staff-or-owner) on every hole-scores handler; reject requests
with no `round_id` for non-admins; allowlist the writable fields.

### C-2 / MA-1 (CRITICAL) — `POST /rounds` forges identity and WHS outputs
`backend/app/rounds/routes.py:101-105` calls `create_round(request.get_json())`; the controller
`backend/app/rounds/controllers.py:33-37` does `round_schema.load(data)` with **no token
stamping and no allowlist**. A player can therefore (a) set `user_id` to **any** user and
attribute a fabricated round to them (C-2), and (b) set the WHS engine's own output columns —
`score_differential`, `adjusted_gross_score`, `handicap_before/after`, `pcc_adjustment`,
`status:"verified"`, `counts_toward_handicap`, `verified_by/verified_date` (MA-1) — which flow
straight into the handicap engine and history. `POST /api/scores/sync` does this correctly
(token-stamped, server-computed); the generic `/rounds` path does not.
**Fix:** mirror `/scores/sync` — stamp `user_id` from the token, allowlist only genuine inputs
(course, tee, date, per-hole gross), and compute/stamp all WHS columns server-side.

### H-1 (HIGH) — club-wide round + handicap-history reads for parent/committee
`backend/app/rounds/routes.py:90-91` and `:144` scope **only** the `player` role to
`caller.id`; parent and committee fall through and read **all** club rounds / any user's
handicap history. Violates parent→own-child isolation.
**Fix:** scope parent to their linked children, committee to a read-across role that is
*intended* (confirm with product), player to self.

### H-5r (HIGH, residual) — sessions cross-coach access cluster
`backend/app/sessions/routes.py`. June's fix scoped approve/decline, but the cluster largely
persists: `PUT /booking-requests/<id>` (`:384-390`) is unscoped (any coach edits any request);
`POST /sessions` (`:85-92`) accepts an arbitrary `coach_id` (no token stamp); `POST/PUT/DELETE
/enrollments` (`:218-253`) let any coach enroll/drop any junior; `GET /booking-requests`
(`:258-274`) is not coach-scoped (reads all).
**Fix:** stamp `coach_id` from the token on create; scope every session/enrollment/booking
handler to the coach's own juniors/sessions.

### NEW-2 (MEDIUM) — null-`coach_id` bypass on booking approve/decline
`backend/app/sessions/routes.py:345,366` guard with `if target_coach is not None and
str(target_coach) != str(caller.id)`. A booking request with a null `coach_id` yields
`target_coach = None`, so **any** coach may approve/decline it — the residual of June's H-5
null-FK bypass class. **Fix:** treat `target_coach is None` as deny-for-coach (admin-only).

**Verified FIXED (no action):** H-2 evaluations now force `coach_id = caller.id` and gate on
`coach_owns_junior` (`backend/app/evaluations/routes.py:62,81-86`); H-3 junior profile/progress
now reject the player role for others (`backend/app/juniors/routes.py:178-179,331-332,342`);
H-4 `PUT /juniors` now applies `STAFF_PROTECTED_FIELDS` (`juniors/routes.py:195,219,222`).

## Mass assignment / input validation

`SimpleModelSchema.load()` (`backend/app/utils/schemas.py:26-31`) copies **every** matching
model column from the body with no `load-exclude`; safety depends on each handler stripping
keys. Sites that don't:

- **MA-1 (HIGH):** `POST /rounds` — see C-2 above.
- **NEW-1 (HIGH) — evaluation *create* forges both sign-offs.**
  `backend/app/evaluations/controllers.py:73-78`. The 2026-06-15 fix stripped `_SIGNOFF_FIELDS`
  from `update_evaluation` (`:85-95`) only. `create_evaluation` still does
  `evaluation_schema.load(data)` unfiltered, and `_validate` (`:108-112`) only rejects
  `committee_signed && !coach_signed`. A coach POSTing
  `{coach_signed:true, committee_signed:true, committee_signed_by:<id>}` therefore inserts a
  **fully self-counter-signed evaluation**, defeating the sequential coach→committee sign-off
  the dedicated `coach_sign`/`committee_sign` endpoints enforce.
  **Fix:** strip `_SIGNOFF_FIELDS` in `create_evaluation` too; force all sign-off state through
  the dedicated endpoints.
- **P-1 (HIGH) — `PUT /users/<id>` self-update mass-assignment.**
  `backend/app/auth/controllers.py:310-312` strips only `role, is_active, email, cdh_number`
  for non-admins; **`membership_number` and `handicap_index` are NOT stripped** and are applied
  by the `setattr` loop at `:314`. Any user can set their own Handicap Index (bypassing WHS
  entirely) or squat a parent's membership number (the unique child-linking key — squatting
  breaks the real parent's signups). Note `PUT /auth/profile` *is* correctly allowlisted; the
  `/users/<id>` path is the leak. **Fix:** add `membership_number, handicap_index` to the
  non-admin strip list.
- **MA-3..MA-5 (Medium/Low):** `award_badge` raw-loads `awarded_by/date/junior_id`
  (`juniors/controllers.py`); tournament `submit_score` lets body set `status`
  (`tournaments/controllers.py`); `create_external_result` raw-loads junior/score. Lower blast
  radius (route-level stamping mostly covers them) but fix as a class.
- **IV-1 (MEDIUM):** no global error handler + unguarded `int()`/date casts → uncaught
  exceptions surface as bare 500s with the wrong envelope (WHS routes are the good
  counter-example that wrap casts). Add an app-level error handler that returns the normalized
  `{error:{code,message}}` envelope.
- **IV-2 (MEDIUM):** no `MAX_CONTENT_LENGTH` set — request bodies are unbounded (compounds
  CSV-1). Set a sane cap (e.g. 1–2 MB, higher only on the import route).

**Injection — clean.** No raw SQL / `text()` / f-string queries; ORM-only, parameterized
LIKE/ILIKE, static `order_by` at all ~30 call sites. No template or command injection
(JSON-only app, no `subprocess`/`eval`). *Info:* LIKE wildcards (`%`,`_`) in search terms are
not escaped — a functional nit, not injection.

## Secrets & config

- `.env` is gitignored (`.gitignore:2`); `.env.example` carries placeholders only; prod config
  reads `SECRET_KEY`/`DATABASE_URI` from env (`backend/config.py:40-41`) and `validate()`
  raises on missing (`:45-52`). Good.
- **CFG-1 (MEDIUM) — `ProductionConfig.validate()` is never called.** `backend/main.py`
  `create_app` never invokes it, so the "fail closed on missing SECRET_KEY/DATABASE_URI"
  guarantee does not actually fire — a prod boot with a missing key would fall through to
  Flask's behavior instead of the intended clear RuntimeError. **Fix:** call
  `ProductionConfig.validate()` in `create_app` when `APP_SETTINGS == config.ProductionConfig`.
- **SEC-2 (LOW):** nothing prevents `APP_SETTINGS=config.TestingConfig` on a prod host, which
  ships a weak hardcoded key (`config.py:14`) and rate limits off. Add a startup guard.
- **SEC-3 (LOW):** `python main.py` runs `debug=True` (`main.py:115`); gunicorn is the intended
  prod path (see `04-server-readiness.md`).

## Transport & headers

- Security headers are set on **every** response (`backend/main.py:70-78`): `X-Content-Type-
  Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-
  origin`, and `Strict-Transport-Security` (only when not debug — correct). CORS is allowlisted
  to `FRONTEND_URL` on `/api/*` only, no wildcard (`main.py:50-55`).
- **FE-3 (MEDIUM):** **no Content-Security-Policy** is set anywhere. A CSP would materially
  shrink the blast radius of the localStorage-token risk (FE-1). Add a restrictive
  `Content-Security-Policy` (script-src 'self', etc.) at the app or reverse-proxy layer.

## Rate limiting

- **SEC-1 (MEDIUM):** Flask-Limiter uses **in-memory** storage — with multiple gunicorn
  workers the effective limit is multiplied Nx and resets on restart. Move to a Redis
  `storage_uri` before running >1 worker in prod.
- **RL-1 (MEDIUM):** only `/login` and `/register` are throttled. Unthrottled abuse surfaces:
  message send, announcement create, achievements sync, tournament registration, and the CSV
  bulk import (bcrypt-per-row). Add limits to the write-heavy / crypto-heavy routes.

## CSV bulk import

Architecturally careful (preview never writes; commit re-parses server-side; per-row savepoints;
staff-only; deterministic synthesized emails). Two gaps:
- **CSV-1 (MEDIUM):** no row/size cap → a multi-MB CSV = thousands of bcrypt hashes + inserts in
  one synchronous request (insider/stolen-staff-token DoS). Cap rows and bytes.
- **CSV-2 (LOW):** cells stored verbatim including leading `= + - @` → formula injection on any
  future export to Excel/Sheets (the React UI itself is safe). Sanitize on import or escape on
  export.

## Frontend

- **Clean XSS posture:** zero `dangerouslySetInnerHTML` / `innerHTML` / `eval` in
  `frontend/src`; all user content is React-escaped. Single hardened client — the only `fetch(`
  is `frontend/src/lib/api.ts:118`; every query routes through it; 401 clears the token and
  redirects (`api.ts:128-137`). No secrets in the bundle beyond `VITE_*` (confirmed none
  sensitive). `npm audit` (prod and full) = **0 vulnerabilities**.
- **FE-1 (LOW, accepted-risk):** JWT stored in `localStorage` under `karen_token`
  (`frontend/src/lib/api.ts:20-29`) — any XSS yields an 8h token. httpOnly cookies would require
  a backend CSRF model (contract change). Keep as accepted risk *if* paired with FE-3 (CSP).
- **FE-2 (MEDIUM):** React Query cache is **not** cleared on logout —
  `frontend/src/auth/AuthProvider.tsx:56-60` clears token/user only; the 401 path in `api.ts`
  also doesn't clear it. On a shared club kiosk, user A's cached data can flash for user B.
  **Fix:** call `queryClient.clear()` on logout and on the 401 handler.

## Dependency CVEs

- **Frontend:** `npm audit` clean (0 across critical/high/moderate/low), lockfile committed,
  stack current (React 19.1, Vite 6.0, TS 5.7).
- **Backend (recency heuristics — exact CVE IDs from `pip-audit` are appended in
  `02-stability.md`):**
  - **DEP-1 (HIGH):** `Flask-Cors==3.0.10` (`requirements.txt:20`) predates the 4.x/5.x
    CORS-bypass fixes.
  - **DEP-2 (HIGH):** `gunicorn==20.1.0` (`requirements.txt:31`) predates request-smuggling
    fixes — and this is the prod WSGI server.
  - **DEP-3 (MEDIUM):** stale `cryptography==39.0.1`, `requests==2.26.0`, `urllib3==1.26.12`,
    `Jinja2==3.1.2`, `certifi==2022.9.24`.
  - *Also flag as cleanup:* several dependencies appear unused/legacy — `AWSIoTPythonSDK`,
    `Flask-Script` (Py2-era, deprecated), `codeclimate-test-reporter`, `coveralls`,
    `Flask-HTTPAuth`, `Flask-RESTful` — each is extra attack surface; confirm and drop
    (see `05-maintainability.md`).

---

## Recommended fix order (security)

1. **C-1, C-2/MA-1** — unscoped hole-scores; `POST /rounds` identity + WHS-output forgery
   (tampering with minors' scores/handicaps). *Blocks go-live.*
2. **NEW-1, H-1, P-1, H-5r, NEW-2** — eval create-path sign-off forgery; club-wide round reads;
   self-service handicap/membership; sessions coach scoping + null-coach bypass.
3. **DEP-1, DEP-2** — Flask-Cors + gunicorn bumps (then cryptography/requests/urllib3/Jinja2/
   certifi).
4. **CFG-1, IV-1, IV-2, SEC-1, RL-1, CSV-1** — call `validate()`; global error handler;
   body-size cap; Redis limiter storage + broader limits; import row cap.
5. **FE-2, FE-3, FE-1** — cache-clear on logout; CSP header; document the localStorage risk.
6. **Lows/Info** — SEC-2, CSV-2, P-2, A-1, register enumeration.
