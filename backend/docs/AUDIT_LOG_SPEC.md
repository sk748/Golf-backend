# Audit Log — Backend Spec & Execution Plan

**Status:** draft for build · **Audience of the feature:** the Karen club admin, who is **not technical**. Entries must read like plain English, not API calls.

## 1. Goal
Give the admin a trustworthy, human-readable record of *what happened, who did it, and when* across the platform — e.g. *"Kofi Coach created a player account for Jane Doe"*, not `POST /api/users role=player`. The frontend should render an entry with **zero interpretation**: it just shows `description` + relative time + an icon by category.

## 2. Design principle: store the sentence
Each log row stores a **pre-rendered human `description`** plus structured fields for filtering. We build the sentence at the moment the action happens (where we know the actor and the target's name), because that context is hard to reconstruct later. Structured fields exist for filtering/search; the `description` is the source of truth for display.

## 3. Data model — `audit_log`
| column | type | notes |
|---|---|---|
| id | int PK | |
| created_at | datetime(tz) | when it happened (TimestampMixin) |
| actor_user_id | str(36) FK→users.id, nullable | null = system/automated |
| actor_name | str(150) | **snapshot** of actor name at the time ("Kofi Coach") |
| actor_role | str(20), nullable | snapshot role ("coach") |
| category | str(30) | enum-ish: `user`, `evaluation`, `tournament`, `round`, `junior`, `session`, `attendance`, `auth`, `system` |
| action | str(50) | machine code: `user.created`, `user.role_changed`, `user.deactivated`, `evaluation.signed`, `evaluation.counter_signed`, `tournament.created`, `round.logged`, `junior.created`, `auth.login` … |
| target_type | str(40), nullable | `user` / `tournament` / `evaluation` / `junior` … |
| target_id | str(64), nullable | id of the affected record (string to fit int + uuid) |
| target_label | str(200), nullable | snapshot human label ("Jane Doe", "Karen Junior Challenge") |
| description | str(400) | **the full human sentence shown to the admin** |
| metadata | JSON, nullable | extra context (old_role/new_role, score, month…) |
| ip_address | str(64), nullable | optional, for security events |

Snapshots (actor_name, target_label) are deliberate: the log must stay readable even if the user/record is later renamed or deleted.

## 4. How entries are created
A single helper, called explicitly at each action site (NOT via blind ORM listeners — listeners can't compose actor-aware sentences):

```python
# app/audit/service.py
def record(action, *, actor=None, category=None, target_type=None,
           target_id=None, target_label=None, description=None, metadata=None):
    """Write one audit row. `actor` is a User or None (system).
    If description is omitted, build a default from a template registry."""
```

A **template registry** maps `action` → a sentence builder so messages stay consistent and descriptive:
```python
TEMPLATES = {
  "user.created":        lambda a,t,m: f"{a} created a new {m['role']} account for {t}.",
  "user.role_changed":   lambda a,t,m: f"{a} changed {t}'s role from {m['old_role']} to {m['new_role']}.",
  "user.deactivated":    lambda a,t,m: f"{a} deactivated the account for {t}.",
  "user.activated":      lambda a,t,m: f"{a} re-activated the account for {t}.",
  "evaluation.signed":   lambda a,t,m: f"{a} signed the {m['month']} evaluation for {t}.",
  "evaluation.counter_signed": lambda a,t,m: f"{a} counter-signed the {m['month']} evaluation for {t}.",
  "tournament.created":  lambda a,t,m: f"{a} created the tournament “{t}”.",
  "round.logged":        lambda a,t,m: f"{a} logged a round for {t} (gross {m.get('gross','—')}).",
  "junior.created":      lambda a,t,m: f"{a} added {t} to the junior programme.",
  "auth.login":          lambda a,t,m: f"{a} signed in.",
}
```
`a` = actor_name (or "System"), `t` = target_label.

Failure isolation: `record()` must **never break the primary action** — wrap its commit in try/except and swallow/log errors. Audit is observational.

## 5. Where to call it (Phase-1 priority events)
Wire `record(...)` into existing controllers:
- **users**: create_user, update_user (role change), admin activate/deactivate → `user.*`
- **evaluations**: sign / counter-sign → `evaluation.*`
- **tournaments**: create_tournament → `tournament.created`
- **rounds**: scores/sync (round created) → `round.logged`
- **juniors**: create junior → `junior.created`
- **auth** (optional, can be noisy): login → `auth.login`

Start with the **users + evaluations + tournaments** set (highest admin value), add the rest incrementally.

## 6. API
```
GET /api/admin/audit-log         @admin_only   (consider also committee read-only)
  query: ?limit=50&offset=0
         &category=user|evaluation|...
         &action=user.created
         &actor_id=<uuid>
         &from=YYYY-MM-DD&to=YYYY-MM-DD
         &q=<text search over description/target_label>
  ->  { "data": [ {id, created_at, actor_name, actor_role, category, action,
                   target_type, target_id, target_label, description, metadata} , ... ],
        "count": <total matching> }      # standard envelope, newest-first
```
Read-only. No create/update/delete endpoints (entries are written server-side only).

## 7. Frontend integration (replaces the interim feed)
The admin dashboard's interim "Recent activity" (assembled client-side from `created_at` on users/tournaments) gets swapped for `GET /api/admin/audit-log?limit=…`. The card renders `description` + relative time + a category icon. A future "Audit log" page can add filters/pagination/search using the query params above.

## 8. Execution plan (backend, branch off backend domain)
1. `app/audit/models.py` — `AuditLog` model (+ `__all__`, import in `app/models.py`).
2. `app/audit/service.py` — `record()` + `TEMPLATES`.
3. `app/audit/controllers.py` + `routes.py` — `list_audit_log(...)` + `GET /api/admin/audit-log` (admin_only), register blueprint in `main.py`.
4. Wire `record()` into users / evaluations / tournaments controllers (then rounds/juniors).
5. Alembic migration for `audit_log`.
6. Tests: helper writes a row; each wired action produces the expected `description`; endpoint filters + pagination + admin-only access.
7. Swagger: add the path + schema.
8. Backfill (optional): seed a few rows from existing `created_at` data so the admin sees history on day one.

## 9. Out of scope (note for later)
- Tamper-proofing / append-only enforcement at the DB level.
- Diff capture of full before/after record states (we store targeted metadata only).
- Export (CSV) — easy follow-up once the page exists.
