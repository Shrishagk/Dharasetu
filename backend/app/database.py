"""Database configuration and session management for UrbanLand Fusion AI."""

import os
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session

from .models import Base

# Database URL from environment or default
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://urbanland:urbanland_dev@localhost:5432/urbanland"
)

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,  # Verify connections before using
    pool_size=20,
    max_overflow=40,
)

# Event listener for SQLAlchemy to enable foreign keys for SQLite (if used)
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints in SQLite."""
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db():
    """Initialize database schema (create all tables)."""
    Base.metadata.create_all(bind=engine)
    print(f"✅ Database initialized at {DATABASE_URL}")


def get_db() -> Generator[Session, None, None]:
    """Dependency injection: get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
