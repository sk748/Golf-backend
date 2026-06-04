import os
from datetime import timedelta

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_swagger_ui import get_swaggerui_blueprint

from app.database.database import db
from app.models import register_all
from app.utils.limiter import limiter

# ── Module blueprints ─────────────────────────────────────────────────────────
from app.auth.routes import user_v1
from app.courses.routes import courses_bp
from app.tournaments.routes import tournaments_bp
from app.rounds.routes import rounds_bp
from app.juniors.routes import juniors_bp
from app.evaluations.routes import evaluations_bp
from app.attendance.routes import attendance_bp
from app.sessions.routes import sessions_bp
from app.admin.routes import admin_bp
from app.whs.routes import whs_v1

def create_app(config_filename=None):
    if config_filename is None:
        config_filename = os.environ.get("APP_SETTINGS", "config.DevelopmentConfig")

    app = Flask(__name__)
    app.config.from_object(config_filename)
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)   # reduced from 24h
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=7)

    JWTManager(app)

    # ── CORS: restrict to known frontend origin in production ─────────────────
    allowed_origins = os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": [o.strip() for o in allowed_origins]}},
    )

    db.init_app(app)
    Migrate(app, db)   # production: flask db migrate / flask db upgrade
    limiter.init_app(app)
    register_all()

    # ── Development: auto-create all tables on startup ────────────────────────
    # Production relies on Flask-Migrate (flask db upgrade) instead.
    if app.debug:
        with app.app_context():
            db.create_all()

    # ── Security headers on every response ───────────────────────────────────
    def _add_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not app.debug:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    app.after_request(_add_security_headers)

    # Register all module blueprints
    app.register_blueprint(user_v1)          # /api/auth/* + /api/users/*
    app.register_blueprint(courses_bp)       # /api/courses, /api/tee-sets, /api/holes, /api/courses-with-tees, /api/seed
    app.register_blueprint(tournaments_bp)   # /api/tournaments, /api/teams, /api/matches, /api/penalties
    app.register_blueprint(rounds_bp)        # /api/rounds, /api/hole-scores, /api/scores/sync
    app.register_blueprint(juniors_bp)       # /api/juniors, /api/level-bands, /api/level-benchmarks, /api/badges
    app.register_blueprint(evaluations_bp)   # /api/evaluations
    app.register_blueprint(attendance_bp)    # /api/attendance
    app.register_blueprint(sessions_bp)      # /api/sessions, /api/classes, /api/enrollments, /api/booking-requests
    app.register_blueprint(admin_bp)         # /api/admin/*
    app.register_blueprint(whs_v1)           # /api/whs/*

    # Swagger UI — served only in non-production environments
    if os.environ.get("APP_SETTINGS") != "config.ProductionConfig":
        swagger_bp = get_swaggerui_blueprint(
            "/swagger",
            "/static/swagger.json",
            config={"app_name": "Karen Golf Management Platform"},
        )
        app.register_blueprint(swagger_bp, url_prefix="/swagger")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
