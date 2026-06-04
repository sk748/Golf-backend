import os


class TestingConfig:
    TESTING = True
    SECRET_KEY = os.environ.get("SECRET_KEY") or "test-only-key-change-in-ci"
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("TEST_DATABASE_URI")
        or "postgresql://postgres:username@localhost/karen_test_db"
    )


class DevelopmentConfig:
    DEBUG = True
    DEVELOPMENT = True
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-key-not-for-production"
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("DATABASE_URI")
        or "postgresql://postgres:username@localhost/karen_db"
    )


class ProductionConfig:
    DEBUG = False           # NEVER True in production
    TESTING = False
    SECRET_KEY = os.environ.get("SECRET_KEY")           # REQUIRED — set in environment
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URI")  # REQUIRED — set in environment

    @classmethod
    def validate(cls):
        """Call this at startup to catch missing production config early."""
        missing = [v for v in ("SECRET_KEY", "DATABASE_URI") if not os.environ.get(v)]
        if missing:
            raise RuntimeError(
                f"Production startup failed — missing env vars: {', '.join(missing)}"
            )
