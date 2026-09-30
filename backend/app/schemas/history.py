"""Schemas for search history, saved standards, analytics and health."""

from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.analysis import RecommendationOut
from app.schemas.common import ORMModel
from app.schemas.standard import StandardSummary


# --------------------------------------------------------------------------- #
#  Search history
# --------------------------------------------------------------------------- #
class SearchHistoryCreate(BaseModel):
    """Allows recording a query manually (e.g. from an external form)."""

    model_config = {"str_strip_whitespace": True}

    specification: str = Field(min_length=10, max_length=20000)
    product_category: str | None = Field(default=None, max_length=200)
    sector: str | None = Field(default=None, max_length=120)
    quantity: str | None = Field(default=None, max_length=120)
    technical_requirements: str | None = Field(default=None, max_length=5000)
    material: str | None = Field(default=None, max_length=200)
    application: str | None = Field(default=None, max_length=200)
    additional_requirements: str | None = Field(default=None, max_length=5000)
    extracted_product: str | None = Field(default=None, max_length=200)
    extracted_sector: str | None = Field(default=None, max_length=120)
    recommendation_count: int = Field(default=0, ge=0, le=1000)
    top_is_number: str | None = Field(default=None, max_length=64)
    top_match_score: float | None = Field(default=None, ge=0, le=100)
    status: str = Field(default="analyzed", pattern="^(analyzed|partial|failed)$")


class SearchHistoryUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(analyzed|partial|failed)$")


class SearchHistoryItem(ORMModel):
    id: int
    specification: str
    product_category: str | None = None
    sector: str | None = None
    quantity: str | None = None
    technical_requirements: str | None = None
    material: str | None = None
    application: str | None = None
    additional_requirements: str | None = None
    extracted_product: str | None = None
    extracted_material: str | None = None
    extracted_application: str | None = None
    extracted_sector: str | None = None
    extracted_requirements: list[str] = Field(default_factory=list)
    extraction_confidence: float = 0.0
    status: str = "analyzed"
    recommendation_count: int = 0
    top_is_number: str | None = None
    top_match_score: float | None = None
    processing_ms: int | None = None
    created_at: dt.datetime
    recommendations: list[RecommendationOut] = Field(default_factory=list)


class SearchHistoryListResponse(BaseModel):
    items: list[SearchHistoryItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    search: str | None = None
    sector: str | None = None


# --------------------------------------------------------------------------- #
#  Saved standards
# --------------------------------------------------------------------------- #
class SavedStandardCreate(BaseModel):
    model_config = {"str_strip_whitespace": True}

    standard_id: int = Field(gt=0)
    query_id: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=4000)
    tag: str | None = Field(default=None, max_length=80)

    @field_validator("tag")
    @classmethod
    def _normalise_tag(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SavedStandardUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=4000)
    tag: str | None = Field(default=None, max_length=80)


class SavedStandardItem(ORMModel):
    id: int
    standard_id: int
    query_id: int | None = None
    notes: str | None = None
    tag: str | None = None
    saved_at: dt.datetime
    standard: StandardSummary
    query_specification: str | None = None


# --------------------------------------------------------------------------- #
#  Analytics
# --------------------------------------------------------------------------- #
class AnalyticsSummary(BaseModel):
    total_queries: int = 0
    total_standards: int = 0
    total_recommendations: int = 0
    total_saved_standards: int = 0
    average_match_score: float = 0.0
    average_extraction_confidence: float = 0.0
    average_processing_ms: float = 0.0
    queries_last_7_days: int = 0
    active_sectors: int = 0
    knowledge_base_demonstration_records: int = 0
    vector_index_size: int = 0
    vector_backend: str = "unknown"
    embedding_model: str = ""


class AnalyticsResponse(BaseModel):
    summary: AnalyticsSummary
    queries_by_sector: list[dict[str, Any]] = Field(default_factory=list)
    top_products: list[dict[str, Any]] = Field(default_factory=list)
    score_distribution: list[dict[str, Any]] = Field(default_factory=list)
    queries_by_day: list[dict[str, Any]] = Field(default_factory=list)
    top_recommended_standards: list[dict[str, Any]] = Field(default_factory=list)
    sector_share: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: dt.datetime


# --------------------------------------------------------------------------- #
#  Health
# --------------------------------------------------------------------------- #
class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    environment: str
    timestamp: dt.datetime
    database: dict[str, Any]
    engine: dict[str, Any]
    configuration: dict[str, Any]
    disclaimer: str
