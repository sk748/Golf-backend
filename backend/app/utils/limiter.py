import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Instantiated here so both main.py (init_app) and route modules
# (decorators) can import it without circular dependencies.
# REDIS_URL (set in production/docker-compose) makes limits shared across
# gunicorn workers and survive restarts; without it, in-memory storage keeps
# local dev working with no Redis running.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri=os.environ.get("REDIS_URL", "memory://"),
)
