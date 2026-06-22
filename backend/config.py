import os


def _env_flag(name, default):
    """Read a boolean env var ('true'/'1'/'yes'); fall back to default."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class TestingConfig:
    TESTING = True
    SECRET_KEY = os.environ.get("SECRET_KEY") or "test-only-key-change-in-ci"
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("TEST_DATABASE_URI")
        or "postgresql://postgres:username@localhost/karen_test_db"
    )
    # Off by default in tests; flip with RATELIMIT_ENABLED=true to exercise 429s.
    RATELIMIT_ENABLED = _env_flag("RATELIMIT_ENABLED", False)


class DevelopmentConfig:
    DEBUG = True
    DEVELOPMENT = True
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-key-not-for-production"
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("DATABASE_URI")
        or "postgresql://postgres:username@localhost/karen_db"
    )
    # Auth rate limits are a production safeguard; off in dev so iterating on
    # login/register doesn't lock the developer out. Set RATELIMIT_ENABLED=true
    # to test the throttle locally.
    RATELIMIT_ENABLED = _env_flag("RATELIMIT_ENABLED", False)


class ProductionConfig:
    DEBUG = False           # NEVER True in production
    TESTING = False
    SECRET_KEY = os.environ.get("SECRET_KEY")           # REQUIRED — set in environment
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URI")  # REQUIRED — set in environment
    # Always on in production (env can't weaken it below this default).
    RATELIMIT_ENABLED = _env_flag("RATELIMIT_ENABLED", True)

    @classmethod
    def validate(cls):
        """Call this at startup to catch missing production config early."""
        missing = [v for v in ("SECRET_KEY", "DATABASE_URI") if not os.environ.get(v)]
        if missing:
            raise RuntimeError(
                f"Production startup failed — missing env vars: {', '.join(missing)}"
            )
