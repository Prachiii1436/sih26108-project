"""Request / response schemas for the applicability demonstrator."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PipelineStage


class ApplicabilityAnalyzeRequest(BaseModel):
    """Step 1 input: the procurement specification the officer wants checked."""

    model_config = ConfigDict(str_strip_whitespace=True)

    specification: str = Field(
        min_length=5,
        max_length=20000,
        description="Free-text procurement specification (product + technical requirements).",
        examples=[
            "Electric water heater, 1000 litre capacity, 230 V, for institutional use."
        ],
    )
    product_name: str | None = Field(default=None, max_length=200)
    technical_requirements: str | None = Field(default=None, max_length=5000)
    file_text: str | None = Field(
        default=None,
        max_length=50000,
        description="Text extracted from an uploaded PDF/TXT tender document.",
    )
    requirements: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Officer-supplied values keyed by requirement dimension. Used by the "
            "'edit extraction' and clarification (recheck) flows; these override the "
            "values parsed from the specification."
        ),
    )
    top_k: int | None = Field(default=None, ge=1, le=20)
    stage: Literal["analyze", "recheck"] = "analyze"


class RequirementFieldOut(BaseModel):
    key: str
    label: str
    value: str | None = None
    numeric: float | None = None
    unit: str | None = None
    source: str = "extracted"
    confidence: float = 0.0
    critical: bool = False
    missing: bool = False


class CheckRow(BaseModel):
    dimension: str
    label: str
    requirement_value: str | None = None
    standard_condition: str
    clause: str | None = None
    critical: bool = True
    condition_text: str | None = None
    operator: str | None = None
    result: Literal["match", "mismatch", "missing", "excluded"]
    detail: str | None = None
    label_extra: str | None = None
    reason: str | None = None
    note: str | None = None


class VersionRow(BaseModel):
    edition: str
    status: str
    year: int | None = None
    note: str | None = None


class RelatedRow(BaseModel):
    edition: str
    title: str
    relationship: str


class EvidenceRow(BaseModel):
    clause: str
    text: str
    supports: str | None = None


class Assessment(BaseModel):
    standard_id: str
    is_number: str
    edition: str
    title: str
    status: str
    status_label: str
    record_status: str
    record_status_label: str = ""
    scope: str
    sector: str = ""
    category: str = ""
    year: int | None = None
    why_selected: list[str] = Field(default_factory=list)
    retrieval_score: float = 0.0
    semantic_score: float = 0.0
    keyword_score: float = 0.0
    checks: list[CheckRow] = Field(default_factory=list)
    matched_count: int = 0
    missing_critical: list[str] = Field(default_factory=list)
    missing_optional: list[str] = Field(default_factory=list)
    conflicting: list[str] = Field(default_factory=list)
    excluded_by: list[str] = Field(default_factory=list)
    reason: str
    why_not_applicable: str = ""
    conditional_note: str = ""
    versions: list[VersionRow] = Field(default_factory=list)
    related: list[RelatedRow] = Field(default_factory=list)
    evidence: list[EvidenceRow] = Field(default_factory=list)
    missing_questions: list[dict[str, Any]] = Field(default_factory=list)
    conditions_total: int = 0


class Clarification(BaseModel):
    dimension: str
    label: str
    question: str
    options: list[str] = Field(default_factory=list)
    affected_standards: list[str] = Field(default_factory=list)
    why: str = ""


class KnowledgeBaseInfo(BaseModel):
    label: str
    notice: str = ""
    kb_version: str = ""
    size: int = 0
    source_file: str | None = None
    database: str | None = None
    sqlite_rows: int | None = None
    disclaimers: list[str] = Field(default_factory=list)


class ApplicabilityResponse(BaseModel):
    """Steps 2-6 of the workflow: extraction, candidates, checks, clarifications."""

    ui_message: str
    knowledge_base: KnowledgeBaseInfo
    specification: str
    product_name: str = ""
    requirements: dict[str, RequirementFieldOut] = Field(default_factory=dict)
    fields: list[RequirementFieldOut] = Field(default_factory=list)
    candidates: list[Assessment] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)
    clarifications: list[Clarification] = Field(default_factory=list)
    pipeline: list[PipelineStage] = Field(default_factory=list)
    processing_ms: float = 0.0
    disclaimer: str
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))


class ReviewCreate(BaseModel):
    """Step 10: human-in-the-loop officer decision on one recommendation."""

    model_config = ConfigDict(str_strip_whitespace=True)

    standard_id: str = Field(max_length=64)
    is_number: str = Field(max_length=64)
    edition: str = Field(max_length=64)
    reported_status: str = Field(max_length=40)
    decision: Literal["accepted", "rejected", "modified"]
    note: str | None = Field(default=None, max_length=1000)
    specification: str = Field(default="", max_length=20000)
    requirements: dict[str, Any] = Field(default_factory=dict)
    user_id: str | None = Field(default=None, max_length=64)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: str
    user_id: str | None = None
    specification: str
    requirements: dict[str, Any] = Field(default_factory=dict)
    kb_id: str
    is_number: str
    edition: str
    reported_status: str
    decision: str
    note: str | None = None


class UploadResponse(BaseModel):
    filename: str
    content_type: str = ""
    chars: int = 0
    pages: int | None = None
    truncated: bool = False
    text: str = ""
    message: str


__all__ = [
    "ApplicabilityAnalyzeRequest",
    "ApplicabilityResponse",
    "Assessment",
    "CheckRow",
    "Clarification",
    "KnowledgeBaseInfo",
    "ReviewCreate",
    "ReviewOut",
    "RequirementFieldOut",
    "UploadResponse",
]
