# Running the Karen Golf backend (Ona / Gitpod environment)

Runbook for restarting the server and live preview in a fresh chat. Copy/paste the
blocks below. Environment-specific values (DB creds, the Ona environment ID) are baked
in — they are correct for **this** workspace.

> **Repo layout:** this is a monorepo — the Flask backend lives in `backend/` and the
> Vite frontend in `frontend/`. **All backend commands below run from `backend/`**, and
> the virtualenv lives at `backend/venv`.

Quick map:
- App: Flask, entrypoint `main.py`, serves on **port 5000**, binds `0.0.0.0`.
- It's an API — the visual "preview" is the **Swagger UI at `/swagger/`**. `GET /` is a 404 (no root route).
- DB: PostgreSQL 16, databases `karen_db` (dev) + `karen_test_db` (tests), role `postgres` / password `postgres`.
- Config is loaded from `.env` via `load_dotenv()` at the top of `main.py`.

---

## 1. Quick restart (the common case)

Use this when the environment was just **stopped and started** (disk persists, tools are
already installed, Postgres just isn't running yet).

```bash
cd /workspaces/Golf-backend/backend

# 1. Start Postgres (it does NOT auto-start)
sudo service postgresql start

# 2. Start the Flask server.
#    In a normal terminal this is enough:
source venv/bin/activate
python main.py
```

> **If you are an AI assistant (Claude Code) starting the server:** do NOT use a bare
> `python main.py &` — the backgrounded process gets reaped when the tool's shell exits.
> Launch it with the Bash tool's `run_in_background: true` instead:
> ```bash
> ./venv/bin/python main.py > /tmp/karen_server.log 2>&1
> ```

Verify (see §4). Then expose the port (see §3) if the preview URL isn't live.

---

## 2. Full bootstrap (only if tools are missing)

If the environment was **rebuilt** (e.g. Dockerfile changed) and `psql`, `python3-venv`,
or the `venv/` are gone, run this once. It's idempotent.

```bash
cd /workspaces/Golf-backend/backend

# System packages (Dockerfile only installs python3 + pip; these are extra)
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  python3-venv postgresql postgresql-client

# Python venv + deps
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Postgres: start, set password, create databases (safe to re-run)
sudo service postgresql start
sudo su postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
sudo su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='karen_db'\"" | grep -q 1 \
  || sudo su postgres -c "createdb karen_db"
sudo su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='karen_test_db'\"" | grep -q 1 \
  || sudo su postgres -c "createdb karen_test_db"
```

> `sudo -u postgres …` will fail in this env ("a terminal is required") because passwordless
> sudo is **root-only**. Always go through root with `sudo su postgres -c "…"`.

Tables are **not** auto-created in any environment (the old `db.create_all()`-on-startup
behavior is retired). Apply the full migration chain to a fresh database before first run:

```bash
cd /workspaces/Golf-backend/backend
FLASK_APP=main.py DATABASE_URI=postgresql://postgres:postgres@localhost/karen_db \
  ./venv/bin/flask db upgrade
```

This creates all 42 tables.

`.env` must exist with a real `SECRET_KEY`. If it's still the placeholder:
```bash
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"
# then paste the value into .env
```

---

## 3. Expose ports for live preview (Ona / Gitpod Flex)

Ports are managed with the `gitpod` CLI (this is Gitpod Flex, not classic Gitpod — there's
no guessable URL until a port is opened). URL pattern for this environment:

```
https://<PORT>--019ea103-0eaa-734f-a6d1-97ace7e01a31.eu-central-1-01.gitpod.dev
```

```bash
gitpod environment port open 5000 --name "Karen API"          # backend
gitpod environment port open 5173 --name "Frontend (Vite)"    # frontend (when ready)
gitpod environment port list                                  # show all + URLs
gitpod environment port preview 5000                          # open in browser
gitpod environment port close 5000                            # stop sharing (do this when done — it's PUBLIC)
```

Current preview URLs:
- **Backend / Swagger:** https://5000--019ea103-0eaa-734f-a6d1-97ace7e01a31.eu-central-1-01.gitpod.dev/swagger/
- **Frontend (Vite):** https://5173--019ea103-0eaa-734f-a6d1-97ace7e01a31.eu-central-1-01.gitpod.dev

`.devcontainer/devcontainer.json` already lists both in `forwardPorts`, so they auto-forward
on a clean start; `gitpod environment port open` is only needed to (re)share publicly.

> ⚠️ An opened port is **public** — anyone with the URL can reach it. Close it when not in use.

---

## 4. Verify it's working

```bash
ss -ltn | grep ':5000'                                         # should show LISTEN 0.0.0.0:5000
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/swagger/   # 200
sudo su postgres -c "psql -d karen_db -c '\dt'" | tail -n +1   # lists 42 tables
```

CORS preflight for the frontend origin (should echo Access-Control-Allow-Origin):
```bash
curl -s -D - -o /dev/null \
  -H "Origin: https://5173--019ea103-0eaa-734f-a6d1-97ace7e01a31.eu-central-1-01.gitpod.dev" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:5000/api/auth/login | grep -i access-control-allow-origin
```

---

## 5. CORS / frontend origins

Allowed origins live in `.env` → `FRONTEND_URL` (comma-separated, no spaces). `main.py`
applies them to `/api/*` only. Currently set to:

```
FRONTEND_URL=http://localhost:3000,http://localhost:5173,https://5173--019ea103-0eaa-734f-a6d1-97ace7e01a31.eu-central-1-01.gitpod.dev
```

After editing `.env`, **restart the server** for changes to take effect.

---

## 6. Stop the server

```bash
pkill -9 -f "venv/bin/python main.py"
```

(Postgres keeps running; stop it with `sudo service postgresql stop` if you really need to.)
