"""
Flask-Migrate CLI wrapper.

Usage:
  # Initialise (first time only — creates migrations/ folder)
  flask db init

  # Auto-generate a migration after model changes
  flask db migrate -m "description of change"

  # Apply pending migrations to the database
  flask db upgrade

  # Roll back the last migration
  flask db downgrade

  # Show current migration state
  flask db current
"""
from flask.cli import FlaskGroup
from main import create_app

app = create_app()
cli = FlaskGroup(app)

if __name__ == "__main__":
    cli()
