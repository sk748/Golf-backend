# Karen Golf Management Platform

Monorepo for Karen Country Club's Junior Golf Development Programme. Two apps:

```
backend/    Flask + PostgreSQL API (JWT auth, WHS engine, all domain logic)
frontend/   React + Vite + TypeScript web client
```

Shared project artifacts live at the repo root: `CLAUDE.md` (what we're building),
`WORKING_AGREEMENT.md` (how we work), `PROGRESS.md` (what's done), `docs/` (product
docs), `ref/` (source planning material), `assets/`, and `.devcontainer/`.

## Backend (`backend/`)

Flask app, entrypoint `main.py`, serves on port **5000**. All backend commands run
from `backend/`; the virtualenv lives at `backend/venv`. Full runbook:
[`backend/RUNNING.md`](backend/RUNNING.md). Copy `backend/.env.example` → `backend/.env`.

```bash
cd backend
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python main.py        # http://localhost:5000/swagger/
```

## Frontend (`frontend/`)

Vite dev server on port **5173**, proxies `/api/*` to the backend (see
`frontend/vite.config.ts`). Copy `frontend/.env.example` → `frontend/.env`.

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```
