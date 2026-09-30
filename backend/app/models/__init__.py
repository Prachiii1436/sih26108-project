"""SQLAlchemy models mirroring ``database/sih26108.sql``.

Column names and types are kept 1:1 with the DDL so the two can never drift.
``Base.metadata`` here is also the source used to auto-create tables when the
operator prefers ``Base.metadata.create_all`` over importing the .sql file.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

StandardStatus = SAEnum(
    "Active",
    "Superseded",
    "Under Revision",
    "Withdrawn",
    "Draft",
    name="standard_status",
    validate_strings=True,
)

RequirementType = SAEnum(
    "technical",
    "performance",
    "safety",
    "material",
    "testing",
    "marking",
    "inspection",
    "durability",
    "other",
    name="requirement_type",
    validate_strings=True,
)

QueryStatus = SAEnum(
    "analyzed", "partial", "failed", name="query_status", validate_strings=True
)

UserRole = SAEnum(
    "officer", "engineer", "reviewer", "admin", name="user_role", validate_strings=True
)


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )


class User(Base, TimestampMixin):
    """Authentication-ready account record. Anonymous demo use leaves this empty."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(191), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(160), nullable=True)
    department: Mapped[str | None] = mapped_column(String(160), nullable=True)
    role: Mapped[str] = mapped_column(
        SAEnum("officer", "engineer", "reviewer", "admin", name="user_role"),
        nullable=False,
        default="officer",
        server_default="officer",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    last_login_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)

    queries = relationship("ProcurementQuery", back_populates="user", passive_deletes=True)
    saved_standards = relationship("SavedStandard", back_populates="user", passive_deletes=True)


class Standard(Base, TimestampMixin):
    """One Indian Standard record in the knowledge base."""

    __tablename__ = "standards"
    __table_args__ = (
        Index("ix_standards_sector", "sector"),
        Index("ix_standards_category", "category"),
        Index("ix_standards_status", "status"),
        Index("ix_standards_year", "year"),
        Index("ix_standards_product", "product"),
        Index("ix_standards_is_number_prefix", "is_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    is_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(400), nullable=False)
    sector: Mapped[str] = mapped_column(String(120), nullable=False, default="General", server_default="General")
    category: Mapped[str] = mapped_column(String(120), nullable=False, default="General", server_default="General")
    product: Mapped[str | None] = mapped_column(String(200), nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(400), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum("Active", "Superseded", "Under Revision", "Withdrawn", "Draft", name="standard_status"),
        nullable=False,
        default="Active",
        server_default="Active",
    )
    revision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    replacement_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demonstration: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[float]
    embedding_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    embedding_dim: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    embedding_updated_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)

    keyword_rows = relationship(
        "StandardKeyword", back_populates="standard", cascade="all, delete-orphan", passive_deletes=True
    )
    requirement_rows = relationship(
        "StandardRequirement",
        back_populates="standard",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    recommendations = relationship(
        "Recommendation", back_populates="standard", passive_deletes=True
    )

    @property
    def keyword_list(self) -> list[str]:
        return _split_list(self.keywords)

    @property
    def requirement_list(self) -> list[str]:
        return _split_list(self.requirements)


def _split_list(value: str | None) -> list[str]:
    if not value:
        return []
    parts: list[str] = []
    for chunk in value.replace("\n", ";").split(";"):
        item = chunk.strip().rstrip(".").strip()
        if item:
            parts.append(item)
    return parts


class StandardKeyword(Base):
    """One keyword of a standard - drives keyword similarity + explorer filters."""

    __tablename__ = "standard_keywords"
    __table_args__ = (
        UniqueConstraint("standard_id", "keyword", name="uq_std_keyword"),
        Index("ix_keyword_value", "keyword"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standards.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    keyword: Mapped[str] = mapped_column(String(191), nullable=False)
    weight: Mapped[Decimal] = mapped_column(
        Numeric(4, 3), nullable=False, default=Decimal("1.000"), server_default="1.000"
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.now()
    )

    standard = relationship("Standard", back_populates="keyword_rows")


class StandardRequirement(Base):
    """Clause-level requirement of a standard - shown as matched evidence."""

    __tablename__ = "standard_requirements"
    __table_args__ = (
        Index("ix_requirement_standard", "standard_id"),
        Index("ix_requirement_type", "requirement_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standards.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    requirement_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    requirement_text: Mapped[str] = mapped_column(Text, nullable=False)
    requirement_type: Mapped[str] = mapped_column(
        SAEnum(
            "technical",
            "performance",
            "safety",
            "material",
            "testing",
            "marking",
            "inspection",
            "durability",
            "other",
            name="requirement_type",
        ),
        nullable=False,
        default="technical",
        server_default="technical",
    )
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.now()
    )

    standard = relationship("Standard", back_populates="requirement_rows")


class ProcurementQuery(Base, TimestampMixin):
    """A procurement specification that was analysed - the search history row."""

    __tablename__ = "procurement_queries"
    __table_args__ = (
        Index("ix_query_created", "created_at"),
        Index("ix_query_user", "user_id"),
        Index("ix_query_sector", "sector"),
        Index("ix_query_product", "extracted_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True
    )
    # --- what the user typed ---------------------------------------------
    specification: Mapped[str] = mapped_column(Text, nullable=False)
    product_category: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(120), nullable=True)
    technical_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    material: Mapped[str | None] = mapped_column(String(200), nullable=True)
    application: Mapped[str | None] = mapped_column(String(200), nullable=True)
    additional_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    # --- what the NLP layer extracted ------------------------------------
    extracted_product: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extracted_material: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extracted_application: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extracted_sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    extracted_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[str]
    extracted_parameters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON dict
    extraction_confidence: Mapped[Decimal] = mapped_column(
        Numeric(4, 3), nullable=False, default=Decimal("0.000"), server_default="0.000"
    )
    status: Mapped[str] = mapped_column(
        SAEnum("analyzed", "partial", "failed", name="query_status"),
        nullable=False,
        default="analyzed",
        server_default="analyzed",
    )
    recommendation_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    top_is_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    top_match_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    processing_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user = relationship("User", back_populates="queries")
    recommendations = relationship(
        "Recommendation",
        back_populates="query",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Recommendation.rank",
    )
    saved_standards = relationship("SavedStandard", back_populates="query", passive_deletes=True)


class Recommendation(Base):
    """A ranked, fully-scored engine output attached to a query."""

    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint("query_id", "standard_id", name="uq_recommendation"),
        Index("ix_recommendation_rank", "query_id", "rank"),
        Index("ix_recommendation_standard", "standard_id"),
        Index("ix_recommendation_score", "match_score"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_id: Mapped[int] = mapped_column(
        ForeignKey("procurement_queries.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standards.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    match_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    semantic_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    keyword_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    product_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    sector_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    requirement_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    application_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0.00")
    matched_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[str]
    matched_keywords: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[str]
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.now()
    )

    query = relationship("ProcurementQuery", back_populates="recommendations")
    standard = relationship("Standard", back_populates="recommendations")

    # Convenience for the API layer -------------------------------------------------
    @property
    def factor_scores(self) -> dict[str, float]:
        return {
            "semantic_similarity": float(self.semantic_score or 0),
            "keyword_similarity": float(self.keyword_score or 0),
            "product_similarity": float(self.product_score or 0),
            "sector_similarity": float(self.sector_score or 0),
            "requirement_similarity": float(self.requirement_score or 0),
            "application_similarity": float(self.application_score or 0),
        }


class SavedStandard(Base):
    """Shortlist entry (bookmark) with optional procurement notes."""

    __tablename__ = "saved_standards"
    __table_args__ = (
        UniqueConstraint("user_id", "standard_id", name="uq_saved_user_standard"),
        Index("ix_saved_standard", "standard_id"),
        Index("ix_saved_saved_at", "saved_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=True
    )
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standards.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    query_id: Mapped[int | None] = mapped_column(
        ForeignKey("procurement_queries.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag: Mapped[str | None] = mapped_column(String(80), nullable=True)
    saved_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.now()
    )

    user = relationship("User", back_populates="saved_standards")
    standard = relationship("Standard", lazy="joined")
    query = relationship("ProcurementQuery", back_populates="saved_standards")


class EngineState(Base):
    """Tiny key/value table recording index build state (vector store metadata)."""

    __tablename__ = "engine_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow, server_default=func.now()
    )
