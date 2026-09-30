"""Shared Pydantic building blocks."""

from __future__ import annotations

import datetime as dt
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base for schemas populated from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Simple acknowledgement payload."""

    success: bool = True
    message: str
    id: int | None = None


class ErrorResponse(BaseModel):
    """Uniform error envelope returned by every non-2xx response."""

    error_code: str = Field(examples=["not_found"])
    message: str
    details: dict[str, object] | None = None
    path: str | None = None
    timestamp: dt.datetime | None = None


class PageMeta(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool


class Page(ORMModel, Generic[T]):
    items: list[T]
    meta: PageMeta

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        total_pages = max(1, -(-total // page_size)) if page_size else 1
        return cls(
            items=items,
            meta=PageMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_previous=page > 1,
            ),
        )


class PipelineStage(BaseModel):
    """A real, completed step of the analysis pipeline (never faked)."""

    key: str = Field(examples=["extraction"])
    label: str = Field(examples=["Extracting requirements"])
    status: str = Field(default="completed", examples=["completed"])
    detail: str | None = None
    duration_ms: float | None = None
