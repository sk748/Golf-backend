import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()  # load variables from .env before config classes read os.environ

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
from app.audit.routes import audit_bp
from app.whs.routes import whs_v1
from app.messaging.routes import messaging_bp
from app.announcements.routes import announcements_bp
from app.notifications.routes import notifications_bp
from app.handicap.routes import handicap_bp
from app.events.routes import events_bp
from app.league.routes import league_bp

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
    Migrate(app, db)   # all envs: flask db upgrade (no create_all anywhere)
    limiter.init_app(app)
    register_all()

    # ── Schema management: Flask-Migrate everywhere ───────────────────────────
    # Dev no longer auto-creates tables on startup; every environment applies
    # schema via `flask db upgrade` (the dev restart script runs it before
    # starting the server). create_all retired 2026-06-10 pre-staging, after
    # verifying the migration chain builds a schema equivalent to the
    # create_all-built dev DB (tables/columns/types + enum label sets).

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
    app.register_blueprint(tournaments_bp)   # /api/tournaments, /api/tournament-*, /api/external-results, /api/series
    app.register_blueprint(rounds_bp)        # /api/rounds, /api/hole-scores, /api/scores/sync
    app.register_blueprint(juniors_bp)       # /api/juniors, /api/level-bands, /api/level-benchmarks, /api/badges
    app.register_blueprint(evaluations_bp)   # /api/evaluations
    app.register_blueprint(attendance_bp)    # /api/attendance
    app.register_blueprint(sessions_bp)      # /api/sessions, /api/classes, /api/enrollments, /api/booking-requests
    app.register_blueprint(admin_bp)         # /api/admin/*
    app.register_blueprint(audit_bp)         # /api/admin/audit-log
    app.register_blueprint(whs_v1)           # /api/whs/*
    app.register_blueprint(messaging_bp)     # /api/conversations, /api/messages, /api/moderation, /api/flags
    app.register_blueprint(events_bp)        # /api/events, /api/events/<id>/rsvp(s)
    app.register_blueprint(announcements_bp) # /api/announcements, /api/public/announcements
    app.register_blueprint(notifications_bp) # /api/notifications
    app.register_blueprint(handicap_bp)      # /api/juniors/<id>/handicap-journey
    app.register_blueprint(league_bp)        # /api/leagues, /api/league-teams, /api/league-fixtures, /api/league-pairings, /api/fixtures, /api/league/scoreboard

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
