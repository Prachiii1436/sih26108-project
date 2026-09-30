"""Request/response schemas for the analysis + recommendation pipeline."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.schemas.common import ORMModel, PipelineStage
from app.schemas.standard import StandardSummary


class AnalyzeRequest(BaseModel):
    """A procurement specification, either free-form or partially structured."""

    model_config = ConfigDict(str_strip_whitespace=True)

    specification: str = Field(
        min_length=10,
        max_length=20000,
        description="Natural-language procurement requirement (the only required field).",
        examples=[
            "We need to purchase 1000 safety helmets for construction workers. "
            "The helmets should provide protection against mechanical impact and penetration."
        ],
    )
    product_category: str | None = Field(default=None, max_length=200)
    sector: str | None = Field(default=None, max_length=120)
    quantity: str | None = Field(default=None, max_length=120)
    technical_requirements: str | None = Field(default=None, max_length=5000)
    material: str | None = Field(default=None, max_length=200)
    application: str | None = Field(default=None, max_length=200)
    additional_requirements: str | None = Field(default=None, max_length=5000)

    top_k: int | None = Field(default=None, ge=1, le=25)
    use_extraction: bool = Field(
        default=True,
        description="False = treat the structured fields as authoritative and skip NLP extraction.",
    )
    persist: bool = Field(
        default=True, description="False = analyse without writing to search history."
    )

    @field_validator("specification")
    @classmethod
    def _meaningful_text(cls, value: str) -> str:
        collapsed = " ".join(value.split())
        if len(collapsed) < settings.min_specification_length:
            raise ValueError(
                f"Specification is too short. Provide at least "
                f"{settings.min_specification_length} characters of meaningful detail "
                "(what is being bought, and the required properties)."
            )
        return collapsed

    @model_validator(mode="after")
    def _nothing_else(self) -> "AnalyzeRequest":
        return self

    def top_k_resolved(self) -> int:
        return min(self.top_k or settings.default_top_k, settings.max_top_k)


class ExtractedRequirements(ORMModel):
    """Output of the NLP requirement-extraction stage."""

    product: str | None = None
    material: str | None = None
    application: str | None = None
    sector: str | None = None
    category: str | None = None
    quantity: str | None = None
    requirements: list[str] = Field(default_factory=list)
    technical_requirements: list[str] = Field(default_factory=list)
    safety_requirements: list[str] = Field(default_factory=list)
    performance_requirements: list[str] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    keywords: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    source: Literal["nlp", "manual", "hybrid"] = "nlp"
    notes: list[str] = Field(default_factory=list)


class MatchFactor(ORMModel):
    key: str
    label: str
    score: float = Field(ge=0, le=100)
    weight: float = Field(ge=0, le=1)
    contribution: float = Field(ge=0, le=100)
    detail: str | None = None


class MatchEvidence(ORMModel):
    matched_requirements: list[str] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class RecommendationOut(ORMModel):
    id: int | None = None
    query_id: int | None = None
    rank: int
    match_score: float = Field(ge=0, le=100)
    relevance_label: str
    semantic_score: float
    keyword_score: float
    product_score: float
    sector_score: float
    requirement_score: float
    application_score: float
    reason: str
    factors: list[MatchFactor] = Field(default_factory=list)
    evidence: MatchEvidence | None = None
    standard: StandardSummary


class AnalyzeResponse(BaseModel):
    """Full analysis result returned to the UI."""

    query_id: int
    specification: str
    extraction: ExtractedRequirements
    recommendations: list[RecommendationOut] = Field(default_factory=list)
    total_candidates: int = 0
    knowledge_base_size: int = 0
    pipeline: list[PipelineStage] = Field(default_factory=list)
    processing_ms: float = 0.0
    top_is_number: str | None = None
    top_match_score: float | None = None
    no_match_message: str | None = None
    disclaimer: str
    created_at: dt.datetime


class RecommendationRequest(BaseModel):
    """Re-rank / re-score an already stored query (no re-analysis of text)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    query_id: int = Field(gt=0)
    top_k: int | None = Field(default=None, ge=1, le=25)
    overrides: ExtractedRequirements | None = Field(
        default=None,
        description="Manually edited extraction (from the UI) to score with instead of the stored one.",
    )

    def top_k_resolved(self) -> int:
        return min(self.top_k or settings.default_top_k, settings.max_top_k)


class RecommendationResponse(BaseModel):
    query_id: int
    specification: str
    extraction: ExtractedRequirements
    recommendations: list[RecommendationOut] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)
    processing_ms: float = 0.0
    no_match_message: str | None = None
    disclaimer: str
