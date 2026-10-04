"""
Database Engine and Session Lifecycle Management

Configures the SQLAlchemy 2.0 engine, declarative mapping base, and
per-request session generator dependency for FastAPI route handlers.
"""

from collections.abc import Generator

# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy ORM models."""

    pass


# Create database engine with connection liveness ping to recover from dropped pool connections
engine = create_engine(settings.database_url, pool_pre_ping=True)

# Session factory producing isolated sessions without automatic commit or flush
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides an isolated SQLAlchemy database session per request.

    Ensures that the session connection is reliably closed and returned to the
    pool when request execution completes, even in the event of unhandled exceptions.

    Yields:
        Session: Active SQLAlchemy database session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

