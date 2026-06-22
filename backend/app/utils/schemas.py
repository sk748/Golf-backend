from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, Time


class SimpleModelSchema:
    def __init__(self, model, many=False, exclude=None, dump_exclude=None):
        self.model = model
        self.many = many
        self.exclude = set(exclude or [])
        self.dump_exclude = set(dump_exclude or [])

    @property
    def columns(self):
        return [col for col in self.model.__table__.columns if col.name not in self.exclude]

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
            result[column.name] = self._serialize(getattr(item, column.name))
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
        t = column.type
        if isinstance(t, DateTime) and isinstance(value, str):
            return datetime.fromisoformat(value)
        if isinstance(t, Date) and isinstance(value, str):
            return date.fromisoformat(value)
        if isinstance(t, Time) and isinstance(value, str):
            return time.fromisoformat(value)
        if isinstance(t, Integer):
            return int(value)
        if isinstance(t, Numeric):
            return Decimal(str(value))
        if isinstance(t, Boolean):
            return bool(value) if not isinstance(value, str) else value.lower() in ("true", "1", "yes")
        return value
