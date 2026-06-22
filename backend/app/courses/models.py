from enum import Enum

from sqlalchemy import (
    CheckConstraint, Column, ForeignKey, Integer,
    Numeric, String, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class TeeSetName(str, Enum):
    white = "white"
    yellow = "yellow"
    blue = "blue"
    red = "red"


class TeeSetGender(str, Enum):
    men = "men"
    women = "women"


class Course(TimestampMixin, db.Model):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    par = Column(Integer, nullable=False)
    altitude_ft = Column(Integer, nullable=True)
    grass_type = Column(String(100), nullable=True)


class TeeSet(TimestampMixin, db.Model):
    __tablename__ = "tee_sets"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    name = Column(SQLEnum(TeeSetName, values_callable=enum_values, name="tee_set_name"), nullable=False)
    gender = Column(SQLEnum(TeeSetGender, values_callable=enum_values, name="tee_set_gender"), nullable=False)
    course_rating = Column(Numeric(4, 1), nullable=False)
    slope_rating = Column(Integer, nullable=False)
    total_yards = Column(Integer, nullable=False)

    course = relationship("Course", backref="tee_sets")

    __table_args__ = (
        UniqueConstraint("course_id", "name", "gender", name="uq_tee_sets_course_name_gender"),
        CheckConstraint("slope_rating BETWEEN 55 AND 155", name="ck_tee_sets_slope_rating"),
    )


class Hole(TimestampMixin, db.Model):
    __tablename__ = "holes"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    par = Column(Integer, nullable=False)
    stroke_index = Column(Integer, nullable=False)
    white_yards = Column(Integer, nullable=False)
    yellow_yards = Column(Integer, nullable=False)
    blue_yards = Column(Integer, nullable=False)
    red_yards = Column(Integer, nullable=False)

    course = relationship("Course", backref="holes")

    __table_args__ = (
        UniqueConstraint("course_id", "hole_number", name="uq_holes_course_hole_number"),
        UniqueConstraint("course_id", "stroke_index", name="uq_holes_course_stroke_index"),
        CheckConstraint("hole_number BETWEEN 1 AND 18", name="ck_holes_hole_number"),
        CheckConstraint("stroke_index BETWEEN 1 AND 18", name="ck_holes_stroke_index"),
        CheckConstraint("par IN (3, 4, 5)", name="ck_holes_par"),
    )
