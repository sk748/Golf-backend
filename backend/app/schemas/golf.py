from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, Time

from app.golf.models import MODEL_REGISTRY


class SimpleModelSchema:
    def __init__(self, model, many=False, exclude=None, dump_exclude=None):
        self.model = model
        self.many = many
        self.exclude = set(exclude or [])
        self.dump_exclude = set(dump_exclude or [])

    @property
    def columns(self):
        return [column for column in self.model.__table__.columns if column.name not in self.exclude]

    def dump(self, value):
        if value is None:
            return None
        if self.many:
            return [self._dump_one(item) for item in value]
        return self._dump_one(value)

    def load(self, data, session=None):
        values = {}
        for column in self.columns:
            if column.name in data:
                values[column.name] = self._coerce(column, data[column.name])
        return self.model(**values)

    def _dump_one(self, item):
        result = {}
        for column in self.columns:
            if column.name in self.dump_exclude:
                continue
            value = getattr(item, column.name)
            result[column.name] = self._serialize(value)
        return result

    def _serialize(self, value):
        if isinstance(value, Enum):
            return value.value
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, (date, datetime, time)):
            return value.isoformat()
        return value

    def _coerce(self, column, value):
        if value is None:
            return None
        column_type = column.type
        if isinstance(column_type, DateTime) and isinstance(value, str):
            return datetime.fromisoformat(value)
        if isinstance(column_type, Date) and isinstance(value, str):
            return date.fromisoformat(value)
        if isinstance(column_type, Time) and isinstance(value, str):
            return time.fromisoformat(value)
        if isinstance(column_type, Integer):
            return int(value)
        if isinstance(column_type, Numeric):
            return Decimal(str(value))
        if isinstance(column_type, Boolean):
            return bool(value) if not isinstance(value, str) else value.lower() in ("true", "1", "yes")
        return value


SCHEMA_REGISTRY = {
    resource: (SimpleModelSchema(model), SimpleModelSchema(model, many=True))
    for resource, model in MODEL_REGISTRY.items()
}


course_schema, courses_schema = SCHEMA_REGISTRY["courses"]
tee_set_schema, tee_sets_schema = SCHEMA_REGISTRY["tee-sets"]
hole_schema, holes_schema = SCHEMA_REGISTRY["holes"]
tournament_schema, tournaments_schema = SCHEMA_REGISTRY["tournaments"]
team_schema, teams_schema = SCHEMA_REGISTRY["teams"]
match_schema, matches_schema = SCHEMA_REGISTRY["matches"]
penalty_schema, penalties_schema = SCHEMA_REGISTRY["penalties"]
level_band_schema, level_bands_schema = SCHEMA_REGISTRY["level-bands"]
level_benchmark_schema, level_benchmarks_schema = SCHEMA_REGISTRY["level-benchmarks"]
junior_schema, juniors_schema = SCHEMA_REGISTRY["juniors"]
evaluation_schema, evaluations_schema = SCHEMA_REGISTRY["evaluations"]
badge_schema, badges_schema = SCHEMA_REGISTRY["badges"]
junior_badge_schema, junior_badges_schema = SCHEMA_REGISTRY["junior-badges"]
class_schema, classes_schema = SCHEMA_REGISTRY["classes"]
enrollment_schema, enrollments_schema = SCHEMA_REGISTRY["enrollments"]
session_schema, sessions_schema = SCHEMA_REGISTRY["sessions"]
attendance_schema, attendances_schema = SCHEMA_REGISTRY["attendance"]
booking_request_schema, booking_requests_schema = SCHEMA_REGISTRY["booking-requests"]
round_schema, rounds_schema = SCHEMA_REGISTRY["rounds"]
hole_score_schema, hole_scores_schema = SCHEMA_REGISTRY["hole-scores"]
