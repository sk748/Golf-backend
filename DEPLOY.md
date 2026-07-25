# Deploying to a VPS (Docker Compose)

Single-box deployment: Caddy (TLS + reverse proxy) → nginx (static frontend) + gunicorn (Flask API) → Postgres 16 + Redis, all via Docker Compose.

## 1. Provision

- VPS with **1–2 vCPU, 2 GB RAM**, any current Linux distro
- Install **Docker** and the **Docker Compose plugin** (`docker compose version` should work)
- Point a **DNS A record** for your domain at the VPS IP (do this before first boot so Caddy can get a certificate)

## 2. Configure

```bash
git clone <repo-url> && cd <repo>

cp backend/.env.production.example backend/.env
# Fill in real values: SECRET_KEY, DATABASE_URI / POSTGRES_* password, FRONTEND_URL, DOMAIN
# Generate the secret: python3 -c "import secrets; print(secrets.token_hex(32))"

echo "DOMAIN=yourdomain.example.com" > .env   # root-level .env, consumed by docker-compose for the Caddyfile
```

## 3. Run

```bash
docker compose up -d --build
```

The backend container runs `flask db upgrade` before starting gunicorn, so the schema is applied automatically.

## 4. Verify

```bash
curl https://yourdomain.example.com/health
```

Caddy obtains the Let's Encrypt certificate automatically on the first request to the real domain — no certbot step. Certificates persist in the `caddy_data` volume.

## Debugging

```bash
docker compose logs -f backend
```
