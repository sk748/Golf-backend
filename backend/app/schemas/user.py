from app.auth.models import User
from app.schemas.golf import SimpleModelSchema


class UserSchema(SimpleModelSchema):
    """Extends SimpleModelSchema to add computed fields expected by the frontend."""

    def _dump_one(self, item):
        result = super()._dump_one(item)
        # Computed: full_name for frontend compatibility
        result["full_name"] = f"{item.first_name} {item.last_name}".strip()
        # Alias: current_hcp_index mirrors handicap_index
        result["current_hcp_index"] = float(item.handicap_index) if item.handicap_index is not None else None
        return result


user_schema = UserSchema(User, dump_exclude=("password_hash",))
users_schema = UserSchema(User, many=True, dump_exclude=("password_hash",))
