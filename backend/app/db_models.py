from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, BigInteger, String, Enum, Text, JSON, ForeignKey


class Base(DeclarativeBase):
    pass


class UserDB(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    username = Column(String(150), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("ef", "hod", "principal"),
        nullable=False
    )
    college_name = Column(String(255), nullable=False)
    department = Column(String(255))

class FacultyDB(Base):
    __tablename__ = "faculty_details"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, unique=True)
    dept = Column(String(255), nullable=False)
    emp_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    orcid = Column(String(50))
    email = Column(String(255), nullable=False)
    phone = Column(String(30), nullable=False)

class EvaluationDB(Base):
    __tablename__ = "evaluations_new"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    faculty_id = Column(BigInteger, nullable=False)
    ef_id = Column(BigInteger, nullable=False)

    academic_year = Column(String(20))
    status = Column(String(20))

    modules = Column(JSON)

    total_points = Column(BigInteger, default=0)

    approved_at = Column(String(50))
    approved_by = Column(String(50))

    reject_reason = Column(Text)

    faculty_signature = Column(Text)
    hod_signature = Column(Text)
    principal_signature = Column(Text)