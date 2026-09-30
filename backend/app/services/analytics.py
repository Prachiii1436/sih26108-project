"""Analytics - every number here is a live aggregate over the MySQL tables."""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.ml.embeddings import embedding_service
from app.ml.vector_store import vector_store
from app.models import ProcurementQuery, Recommendation, SavedStandard, Standard
from app.schemas.history import AnalyticsResponse, AnalyticsSummary

logger = get_logger(__name__)

SCORE_BUCKETS: list[tuple[str, int, int]] = [
    ("90-100", 90, 100),
    ("75-89", 75, 89.99),
    ("60-74", 60, 74.99),
    ("45-59", 45, 59.99),
    ("30-44", 30, 44.99),
    ("0-29", 0, 29.99),
]


def _scalar(session: Session, statement) -> Any:
    return session.execute(statement).scalar()


def build_analytics(session: Session, *, days: int = 30) -> AnalyticsResponse:
    total_queries = int(_scalar(session, select(func.count()).select_from(ProcurementQuery)) or 0)
    total_standards = int(_scalar(session, select(func.count()).select_from(Standard)) or 0)
    total_recommendations = int(
        _scalar(session, select(func.count()).select_from(Recommendation)) or 0
    )
    total_saved = int(_scalar(session, select(func.count()).select_from(SavedStandard)) or 0)

    avg_score = float(
        _scalar(session, select(func.avg(Recommendation.match_score))) or 0.0
    )
    avg_confidence = float(
        _scalar(session, select(func.avg(ProcurementQuery.extraction_confidence))) or 0.0
    )
    avg_ms = float(
        _scalar(
            session,
            select(func.avg(ProcurementQuery.processing_ms)).where(
                ProcurementQuery.processing_ms.is_not(None)
            ),
        )
        or 0.0
    )
    demonstration = int(
        _scalar(
            session,
            select(func.count()).select_from(Standard).where(Standard.is_demonstration.is_(True)),
        )
        or 0
    )
    since = dt.datetime.now() - dt.timedelta(days=7)
    last_7 = int(
        _scalar(
            session,
            select(func.count())
            .select_from(ProcurementQuery)
            .where(ProcurementQuery.created_at >= since),
        )
        or 0
    )
    sector_count = int(
        _scalar(session, select(func.count(func.distinct(ProcurementQuery.extracted_sector)))) or 0
    )

    summary = AnalyticsSummary(
        total_queries=total_queries,
        total_standards=total_standards,
        total_recommendations=total_recommendations,
        total_saved_standards=total_saved,
        average_match_score=round(avg_score, 2),
        average_extraction_confidence=round(avg_confidence, 3),
        average_processing_ms=round(avg_ms, 1),
        queries_last_7_days=last_7,
        active_sectors=sector_count,
        knowledge_base_demonstration_records=demonstration,
        vector_index_size=vector_store.size,
        vector_backend=vector_store.backend,
        embedding_model=embedding_service.model_name,
    )

    return AnalyticsResponse(
        summary=summary,
        queries_by_sector=_queries_by_sector(session),
        top_products=_top_products(session),
        score_distribution=_score_distribution(session),
        queries_by_day=_queries_by_day(session, days=days),
        top_recommended_standards=_top_standards(session),
        sector_share=_sector_share(session),
        generated_at=dt.datetime.now(),
    )


def _queries_by_sector(session: Session) -> list[dict[str, Any]]:
    """Queries grouped by the sector the extractor detected."""
    detected = func.coalesce(
        ProcurementQuery.extracted_sector, ProcurementQuery.sector, "Unclassified"
    )
    rows = session.execute(
        select(detected.label("sector"), func.count().label("queries"))
        .group_by(detected)
        .order_by(func.count().desc())
        .limit(12)
    ).all()
    return [{"sector": r.sector or "Unclassified", "queries": int(r.queries)} for r in rows]


def _top_products(session: Session) -> list[dict[str, Any]]:
    product = func.coalesce(ProcurementQuery.extracted_product, "Unclassified")
    rows = session.execute(
        select(product.label("product"), func.count().label("queries"))
        .group_by(product)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    return [{"product": r.product or "Unclassified", "queries": int(r.queries)} for r in rows]


def _score_distribution(session: Session) -> list[dict[str, Any]]:
    """Histogram of stored recommendation scores - real SQL bucketing per band."""
    ordered: list[dict[str, Any]] = []
    for label, low, high in SCORE_BUCKETS:
        value = _scalar(
            session,
            select(func.count())
            .select_from(Recommendation)
            .where(
                Recommendation.match_score >= low,
                Recommendation.match_score <= high,
            ),
        )
        ordered.append({"range": label, "count": int(value or 0)})
    return ordered


def _queries_by_day(session: Session, *, days: int = 30) -> list[dict[str, Any]]:
    start = (dt.datetime.now() - dt.timedelta(days=days - 1)).date()
    rows = session.execute(
        select(
            func.date(ProcurementQuery.created_at).label("day"),
            func.count().label("queries"),
        )
        .where(ProcurementQuery.created_at >= dt.datetime.combine(start, dt.time.min))
        .group_by(func.date(ProcurementQuery.created_at))
        .order_by(func.date(ProcurementQuery.created_at))
    ).all()
    found = {str(r.day): int(r.queries) for r in rows}
    series: list[dict[str, Any]] = []
    for offset in range(days):
        day = start + dt.timedelta(days=offset)
        key = day.isoformat()
        series.append({"day": key, "queries": found.get(key, 0)})
    return series


def _top_standards(session: Session, limit: int = 8) -> list[dict[str, Any]]:
    rows = session.execute(
        select(
            Standard.id,
            Standard.is_number,
            Standard.title,
            Standard.sector,
            func.count(Recommendation.id).label("hits"),
            func.avg(Recommendation.match_score).label("avg_score"),
            func.max(Recommendation.match_score).label("best_score"),
        )
        .join(Recommendation, Recommendation.standard_id == Standard.id)
        .group_by(Standard.id, Standard.is_number, Standard.title, Standard.sector)
        .order_by(func.count(Recommendation.id).desc(), func.avg(Recommendation.match_score).desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": int(r.id),
            "is_number": r.is_number,
            "title": r.title,
            "sector": r.sector,
            "recommendations": int(r.hits),
            "average_score": round(float(r.avg_score or 0), 2),
            "best_score": round(float(r.best_score or 0), 2),
        }
        for r in rows
    ]


def _sector_share(session: Session) -> list[dict[str, Any]]:
    """How much of the knowledge base each sector occupies."""
    rows = session.execute(
        select(Standard.sector, func.count().label("count"))
        .group_by(Standard.sector)
        .order_by(func.count().desc())
    ).all()
    total = sum(int(r.count) for r in rows) or 1
    return [
        {
            "sector": r.sector or "General",
            "count": int(r.count),
            "share": round(int(r.count) / total * 100, 2),
        }
        for r in rows
    ]
