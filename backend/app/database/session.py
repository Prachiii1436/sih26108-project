"""Engine + session management for XAMPP MySQL (127.0.0.1:3307).

SQLAlchemy's ORM layer is used for every query, which parameterises all values
and removes SQL-injection risk from user input.
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import InterfaceError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.exceptions import DatabaseUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)

_ENGINE: Engine | None = None
_SESSION_FACTORY: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    kwargs: dict[str, Any] = {
        "echo": False,
        "pool_pre_ping": True,
        "pool_recycle": settings.db_pool_recycle,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "future": True,
    }
    if settings.database_url.startswith("mysql"):
        kwargs["connect_args"] = {
            "connect_timeout": settings.db_connect_timeout,
            "charset": settings.mysql_charset,
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        }
    else:  # pragma: no cover - sqlite fallback for unit tests
        kwargs.pop("pool_size", None)
        kwargs.pop("max_overflow", None)
        kwargs.pop("pool_recycle", None)

    engine = create_engine(settings.database_url, **kwargs)

    @event.listens_for(engine, "connect")
    def _set_session_mode(dbapi_connection, _record) -> None:  # noqa: ANN001
        with dbapi_connection.cursor() as cursor:
            cursor.execute("SET SESSION sql_mode='STRICT_TRANS_TABLES'")
            cursor.execute("SET SESSION time_zone='+05:30'")

    logger.info("SQLAlchemy engine created for %s", settings.safe_database_target())
    return engine


def get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = _build_engine()
    return _ENGINE


def get_session_factory() -> sessionmaker[Session]:
    global _SESSION_FACTORY
    if _SESSION_FACTORY is None:
        _SESSION_FACTORY = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
    return _SESSION_FACTORY


def reset_engine() -> None:
    """Dispose of the pool - used by scripts and after a MySQL restart."""
    global _ENGINE, _SESSION_FACTORY
    if _ENGINE is not None:
        _ENGINE.dispose()
    _ENGINE = None
    _SESSION_FACTORY = None


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Transactional scope: commit on success, rollback on any exception."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session.

    The transaction is committed by the route; the session is always closed and
    rolled back on failure.
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()
        raise translate_db_error(exc) from exc
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database() -> tuple[bool, str, dict[str, Any]]:
    """Return ``(ok, message, details)`` without raising - used by /api/health."""
    details: dict[str, Any] = {
        "target": settings.safe_database_target(),
        "port": settings.mysql_port,
    }
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            row = conn.execute(
                text("SELECT VERSION() AS version, @@port AS port")
            ).mappings().first()
            if row:
                details["server_version"] = str(row.get("version"))
                details["server_port"] = int(row.get("port") or 0)
            counts = conn.execute(
                text(
                    "SELECT COUNT(*) AS standards FROM standards"
                )
            ).mappings().first()
            details["standards_count"] = int(counts["standards"]) if counts else 0
        return True, "connected", details
    except (OperationalError, InterfaceError, SQLAlchemyError) as exc:
        logger.error("Database health check failed: %s", exc)
        return False, _short_db_message(exc), details
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected database health check failure")
        return False, str(exc), details


def translate_db_error(exc: Exception) -> Exception:
    """Map SQLAlchemy/driver errors onto safe domain exceptions."""
    if isinstance(exc, (OperationalError, InterfaceError)):
        return DatabaseUnavailableError(details={"database": settings.safe_database_target()})
    return exc


def _short_db_message(exc: Exception) -> str:
    text_ = str(getattr(exc, "orig", exc))
    lowered = text_.lower()
    if "access denied" in lowered:
        return "MySQL rejected the configured credentials (check MYSQL_USER / MYSQL_PASSWORD)."
    if "unknown database" in lowered:
        return f"Database '{settings.mysql_database}' does not exist - import database/sih26108.sql."
    if "connection refused" in lowered or "can't connect" in lowered:
        return (
            f"Could not connect to MySQL on {settings.mysql_host}:{settings.mysql_port}. "
            "Start MySQL in the XAMPP Control Panel."
        )
    return "MySQL connection failed. Check that MySQL is running in XAMPP."


@contextmanager
def read_only_session() -> Iterator[Session]:
    """Convenience wrapper used by analytics/aggregations."""
    with session_scope() as session:
        yield session
