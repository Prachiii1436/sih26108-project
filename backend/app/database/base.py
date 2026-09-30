"""Declarative SQLAlchemy base shared by every ORM model."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class. All models import this so metadata is registered once."""

    def as_dict(self) -> dict[str, object]:
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        pk = self.__table__.primary_key.columns.values()
        key = ", ".join(f"{c.name}={getattr(self, c.name)!r}" for c in list(pk)[:1])
        return f"<{self.__class__.__name__} {key}>"
