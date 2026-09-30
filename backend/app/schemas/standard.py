"""Schemas for the standards knowledge base, explorer and compare endpoints."""

from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import ORMModel


class StandardKeywordOut(ORMModel):
    id: int
    keyword: str
    weight: float = 0.0


class StandardRequirementOut(ORMModel):
    id: int
    requirement_code: str | None = None
    requirement_text: str
    requirement_type: str = "technical"
    is_mandatory: bool = True
    notes: str | None = None


class StandardSummary(ORMModel):
    id: int
    is_number: str
    title: str
    sector: str
    category: str
    product: str | None = None
    year: int | None = None
    status: str = "Active"
    is_demonstration: bool = True
    source: str | None = None
    source_url: str | None = None


class StandardDetail(StandardSummary):
    scope: str | None = None
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    revision: str | None = None
    replacement_code: str | None = None
    keyword_rows: list[StandardKeywordOut] = Field(default_factory=list)
    requirement_rows: list[StandardRequirementOut] = Field(default_factory=list)
    related_standards: list[StandardSummary] = Field(default_factory=list)
    saved: bool = False
    recommendation_count: int = 0
    created_at: dt.datetime | None = None
    updated_at: dt.datetime | None = None


class StandardFacets(ORMModel):
    """Distinct filter values - powers the Explorer sidebar."""

    sectors: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    years: list[int] = Field(default_factory=list)
    total: int = 0


class StandardListResponse(ORMModel):
    items: list[StandardSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    facets: dict[str, Any] = Field(default_factory=dict)


class CompareRequest(ORMModel):
    standard_ids: list[int] = Field(min_length=2, max_length=4)
    query_id: int | None = Field(
        default=None,
        description="Optional: attach match scores / reasons from a specific analysis.",
    )

    @field_validator("standard_ids")
    @classmethod
    def _unique_ids(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value):
            raise ValueError("standard_ids must not contain duplicates")
        if any(i <= 0 for i in value):
            raise ValueError("standard_ids must be positive integers")
        return value


class CompareRow(ORMModel):
    field: str
    label: str
    values: list[str | None]


class SimilarityPair(ORMModel):
    a_id: int
    b_id: int
    a_is_number: str
    b_is_number: str
    similarity: float = Field(ge=0, le=100)


class CompareResponse(ORMModel):
    standards: list[StandardDetail]
    rows: list[CompareRow]
    query_id: int | None = None
    pairwise_similarity: list[SimilarityPair] = Field(default_factory=list)
    summary: str | None = None
