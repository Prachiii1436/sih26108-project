"""Persistent search history over ``procurement_queries`` + ``recommendations``."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models import ProcurementQuery, Recommendation, Standard
from app.schemas.analysis import MatchEvidence, RecommendationOut
from app.schemas.history import (
    SearchHistoryCreate,
    SearchHistoryItem,
    SearchHistoryListResponse,
    SearchHistoryUpdate,
)
from app.schemas.standard import StandardSummary
from app.services.recommendation import relevance_label, to_decimal
from app.services.standards import decode_json_list

logger = get_logger(__name__)


def _hydrate(row: ProcurementQuery, recommendations: list[Recommendation]) -> SearchHistoryItem:
    return SearchHistoryItem(
        id=row.id,
        specification=row.specification,
        product_category=row.product_category,
        sector=row.sector,
        quantity=row.quantity,
        technical_requirements=row.technical_requirements,
        material=row.material,
        application=row.application,
        additional_requirements=row.additional_requirements,
        extracted_product=row.extracted_product,
        extracted_material=row.extracted_material,
        extracted_application=row.extracted_application,
        extracted_sector=row.extracted_sector,
        extracted_requirements=decode_json_list(row.extracted_requirements),
        extraction_confidence=float(row.extraction_confidence or 0),
        status=row.status,
        recommendation_count=row.recommendation_count,
        top_is_number=row.top_is_number,
        top_match_score=float(row.top_match_score) if row.top_match_score is not None else None,
        processing_ms=row.processing_ms,
        created_at=row.created_at,
        recommendations=[_recommendation_out(r) for r in recommendations],
    )


def _recommendation_out(row: Recommendation) -> RecommendationOut:
    score = float(row.match_score or 0)
    return RecommendationOut(
        id=row.id,
        query_id=row.query_id,
        rank=row.rank,
        match_score=score,
        relevance_label=relevance_label(score),
        semantic_score=float(row.semantic_score or 0),
        keyword_score=float(row.keyword_score or 0),
        product_score=float(row.product_score or 0),
        sector_score=float(row.sector_score or 0),
        requirement_score=float(row.requirement_score or 0),
        application_score=float(row.application_score or 0),
        reason=row.reason or "",
        factors=[],
        evidence=MatchEvidence(
            matched_requirements=decode_json_list(row.matched_requirements),
            matched_keywords=decode_json_list(row.matched_keywords),
        ),
        standard=StandardSummary(
            id=row.standard.id,
            is_number=row.standard.is_number,
            title=row.standard.title,
            sector=row.standard.sector,
            category=row.standard.category,
            product=row.standard.product,
            year=row.standard.year,
            status=row.standard.status,
            is_demonstration=bool(row.standard.is_demonstration),
            source=row.standard.source,
            source_url=row.standard.source_url,
        ),
    )


def list_history(
    session: Session,
    *,
    user_id: int | None = None,
    search: str | None = None,
    sector: str | None = None,
    page: int = 1,
    page_size: int = 15,
    include_recommendations: bool = True,
) -> SearchHistoryListResponse:
    clauses: list[Any] = []
    if user_id is not None:
        clauses.append(
            or_(ProcurementQuery.user_id == user_id, ProcurementQuery.user_id.is_(None))
        )
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            or_(
                ProcurementQuery.specification.like(like),
                ProcurementQuery.extracted_product.like(like),
                ProcurementQuery.top_is_number.like(like),
            )
        )
    if sector:
        clauses.append(
            or_(
                ProcurementQuery.sector == sector,
                ProcurementQuery.extracted_sector == sector,
            )
        )
    where = and_(*clauses) if clauses else True

    total = int(
        session.execute(select(func.count()).select_from(ProcurementQuery).where(where)).scalar_one()
    )

    stmt = (
        select(ProcurementQuery)
        .where(where)
        .order_by(ProcurementQuery.created_at.desc(), ProcurementQuery.id.desc())
        .offset(max(0, (page - 1) * page_size))
        .limit(page_size)
    )
    if include_recommendations:
        stmt = stmt.options(
            selectinload(ProcurementQuery.recommendations).selectinload(Recommendation.standard)
        )
    rows = list(session.execute(stmt).scalars().unique().all())

    return SearchHistoryListResponse(
        items=[_hydrate(row, list(row.recommendations)) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)) if page_size else 1,
        search=search,
        sector=sector,
    )


def get_history_item(
    session: Session, query_id: int, *, user_id: int | None = None
) -> SearchHistoryItem:
    row = session.execute(
        select(ProcurementQuery)
        .where(ProcurementQuery.id == query_id)
        .options(selectinload(ProcurementQuery.recommendations).selectinload(Recommendation.standard))
    ).scalars().first()
    if row is None:
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    if user_id is not None and row.user_id not in (None, user_id):
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    return _hydrate(row, list(row.recommendations))


def create_history(
    session: Session, payload: SearchHistoryCreate, *, user_id: int | None = None
) -> SearchHistoryItem:
    row = ProcurementQuery(
        specification=payload.specification,
        product_category=payload.product_category,
        sector=payload.sector,
        quantity=payload.quantity,
        technical_requirements=payload.technical_requirements,
        material=payload.material,
        application=payload.application,
        additional_requirements=payload.additional_requirements,
        extracted_product=payload.extracted_product,
        extracted_sector=payload.extracted_sector,
        extracted_requirements=json.dumps([], ensure_ascii=False),
        extracted_parameters=json.dumps({}, ensure_ascii=False),
        extraction_confidence=to_decimal(0.0),
        status=payload.status,
        recommendation_count=payload.recommendation_count,
        top_is_number=payload.top_is_number,
        top_match_score=to_decimal(payload.top_match_score)
        if payload.top_match_score is not None
        else None,
    )
    if user_id is not None:
        row.user_id = user_id
    session.add(row)
    session.flush()
    logger.info("Manual search-history entry #%s created", row.id)
    return _hydrate(row, [])


def update_history(
    session: Session, query_id: int, payload: SearchHistoryUpdate, *, user_id: int | None = None
) -> SearchHistoryItem:
    row = session.get(ProcurementQuery, query_id)
    if row is None:
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    if user_id is not None and row.user_id not in (None, user_id):
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    if payload.status:
        row.status = payload.status
    if payload.notes:
        marker = "\n\n[Procurement note] "
        row.additional_requirements = (row.additional_requirements or "") + marker + payload.notes
    session.flush()
    return _hydrate(row, list(row.recommendations))


def delete_history(session: Session, query_id: int, *, user_id: int | None = None) -> None:
    row = session.get(ProcurementQuery, query_id)
    if row is None:
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    if user_id is not None and row.user_id not in (None, user_id):
        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )
    session.execute(delete(Recommendation).where(Recommendation.query_id == query_id))
    session.delete(row)
    session.flush()
    logger.info("Search history entry #%s deleted", query_id)


def history_facets(session: Session, *, user_id: int | None = None) -> dict[str, Any]:
    sectors = [
        row[0]
        for row in session.execute(
            select(ProcurementQuery.extracted_sector)
            .distinct()
            .order_by(ProcurementQuery.extracted_sector)
        ).all()
        if row[0]
    ]
    return {"sectors": sectors}


def top_standard_for(session: Session, query_id: int) -> Standard | None:
    row = session.execute(
        select(Standard)
        .join(Recommendation, Recommendation.standard_id == Standard.id)
        .where(Recommendation.query_id == query_id)
        .order_by(Recommendation.rank)
        .limit(1)
    ).scalars().first()
    return row
