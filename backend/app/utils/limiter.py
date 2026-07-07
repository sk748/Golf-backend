from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Instantiated here so both main.py (init_app) and route modules
# (decorators) can import it without circular dependencies.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
