import uuid
from datetime import datetime, timezone
from enum import Enum

import bcrypt as _bcrypt

from flask_jwt_extended import create_access_token
from sqlalchemy import CheckConstraint, Column, DateTime, Numeric, String, Boolean
from sqlalchemy import Enum as SQLEnum

from app.database.database import db


class UserRole(str, Enum):
    admin = "admin"
    coach = "coach"
    committee = "committee"
    parent = "parent"
    player = "player"


class MembershipType(str, Enum):
    full = "full"
    social = "social"
    guest = "guest"
    junior = "junior"


class User(db.Model):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(1000), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(SQLEnum(UserRole, name="user_role"), nullable=False, default=UserRole.player)
    membership_type = Column(
        SQLEnum(MembershipType, name="user_membership_type"),
        nullable=False,
        default=MembershipType.guest,
    )
    handicap_index = Column(Numeric(4, 1), nullable=True)
    cdh_number = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint("handicap_index IS NULL OR handicap_index BETWEEN -10.0 AND 54.0", name="ck_users_handicap_index"),
    )

    # Backward-compatible aliases for the existing auth controller.
    @property
    def password(self):
        return self.password_hash

    @password.setter
    def password(self, value):
        self.password_hash = value

    @property
    def firstName(self):
        return self.first_name

    @firstName.setter
    def firstName(self, value):
        self.first_name = value

    @property
    def lastName(self):
        return self.last_name

    @lastName.setter
    def lastName(self, value):
        self.last_name = value

    @property
    def phoneNumber(self):
        return self.phone

    @phoneNumber.setter
    def phoneNumber(self, value):
        self.phone = str(value) if value is not None else None

    @property
    def user_role(self):
        return self.role.value if isinstance(self.role, UserRole) else self.role

    @user_role.setter
    def user_role(self, value):
        legacy_map = {"super_admin": UserRole.admin, "user": UserRole.player}
        self.role = legacy_map.get(value, value)

    def save(self, session):
        session.add(self)
        session.commit()

    @classmethod
    def get_all(cls, session):
        return session.query(cls).all()

    @classmethod
    def get_one(cls, id, session):
        return session.get(cls, id)

    def generate_auth_token(self, permission_level=None):
        admin_claim = 1 if self.role == UserRole.admin else 0
        if permission_level is not None:
            admin_claim = permission_level
        return create_access_token(
            identity=self.email,
            additional_claims={"role": self.user_role, "admin": admin_claim},
        )

    @staticmethod
    def generate_password_hash(password: str) -> str:
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

    def verify_password_hash(self, password: str) -> bool:
        return _bcrypt.checkpw(password.encode("utf-8"), self.password_hash.encode("utf-8"))
