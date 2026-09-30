"""Analysis orchestration: extraction -> search -> scoring -> persistence.

This module owns the transaction for ``POST /api/analyze`` so the query row and
its recommendations are always written together (or not at all).
"""

from __future__ import annotations

import json
import time
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models import ProcurementQuery, Recommendation, Standard
from app.schemas.analysis import (
    AnalyzeRequest,
    AnalyzeResponse,
    ExtractedRequirements,
    MatchEvidence,
    RecommendationOut,
    RecommendationResponse,
)
from app.schemas.common import PipelineStage
from app.schemas.standard import StandardSummary
from app.ml.vector_store import vector_store
from app.services.nlp import extract_requirements
from app.services.recommendation import (
    NO_MATCH_MESSAGE,
    ScoredStandard,
    engine,
    relevance_label,
    to_decimal,
)

logger = get_logger(__name__)

DISCLAIMER = (
    "SIH26108 prototype decision-support output. Recommendations and relevance scores "
    "are produced by this application from a demonstration knowledge base - they are "
    "not a Bureau of Indian Standards certification, approval or compliance statement. "
    "Verify the applicable standard, its current edition and amendments with BIS before "
    "finalising any procurement."
)


def _summary_from_document(doc) -> StandardSummary:
    return StandardSummary(
        id=doc.id,
        is_number=doc.is_number,
        title=doc.title,
        sector=doc.sector or "General",
        category=doc.category or "General",
        product=doc.product,
        year=doc.year,
        status=doc.status,
        is_demonstration=doc.is_demonstration,
        source=doc.source,
        source_url=doc.source_url,
    )


def _recommendation_out(
    item: ScoredStandard, extraction: ExtractedRequirements, *, rank: int
) -> RecommendationOut:
    factors = engine.factor_objects(item)
    evidence = MatchEvidence(
        matched_requirements=item.matched_requirements,
        matched_keywords=item.matched_keywords,
        strengths=item.strengths,
        gaps=item.gaps,
    )
    return RecommendationOut(
        rank=rank,
        match_score=item.final,
        relevance_label=relevance_label(item.final),
        semantic_score=item.semantic,
        keyword_score=item.keyword,
        product_score=item.product,
        sector_score=item.sector,
        requirement_score=item.requirement,
        application_score=item.application,
        reason=engine.explain(item, extraction),
        factors=factors,
        evidence=evidence,
        standard=_summary_from_document(item.standard),
    )


def _build_query_row(
    request: AnalyzeRequest, extraction: ExtractedRequirements, processing_ms: int
) -> ProcurementQuery:
    return ProcurementQuery(
        specification=request.specification,
        product_category=request.product_category,
        sector=request.sector,
        quantity=request.quantity,
        technical_requirements=request.technical_requirements,
        material=request.material,
        application=request.application,
        additional_requirements=request.additional_requirements,
        extracted_product=extraction.product,
        extracted_material=extraction.material,
        extracted_application=extraction.application,
        extracted_sector=extraction.sector,
        extracted_requirements=json.dumps(extraction.requirements, ensure_ascii=False),
        extracted_parameters=json.dumps(extraction.parameters, ensure_ascii=False),
        extraction_confidence=Decimal(str(extraction.confidence)),
        status="analyzed" if extraction.confidence >= 0.35 else "partial",
        recommendation_count=0,
        processing_ms=processing_ms,
    )


def run_extraction(request: AnalyzeRequest) -> ExtractedRequirements:
    """Public helper so the UI can re-run extraction on edited text."""
    return extract_requirements(
        request.specification,
        product_category=request.product_category,
        sector=request.sector,
        material=request.material,
        application=request.application,
        quantity=request.quantity,
        technical_requirements=request.technical_requirements,
        additional_requirements=request.additional_requirements,
    )


def analyze(session: Session, request: AnalyzeRequest, *, user_id: int | None = None) -> AnalyzeResponse:
    """Full pipeline. Persists the query + recommendations unless ``persist=False``."""
    started = time.perf_counter()
    stages: list[PipelineStage] = []

    stages.append(
        PipelineStage(
            key="read",
            label="Reading specification",
            status="completed",
            detail=f"{len(request.specification)} characters of procurement text",
            duration_ms=0.0,
        )
    )

    # --- Step 2/3: normalise + extract ---------------------------------- #
    t0 = time.perf_counter()
    if request.use_extraction:
        extraction = run_extraction(request)
    else:
        # Structured-only mode: trust the fields the user typed in.
        extraction = ExtractedRequirements(
            product=request.product_category,
            material=request.material,
            application=request.application,
            sector=request.sector,
            category=request.product_category,
            quantity=request.quantity,
            requirements=[
                line.strip()
                for line in (request.technical_requirements or "").replace("\n", ";").split(";")
                if line.strip()
            ],
            keywords=[
                w.strip().lower()
                for w in " ".join(
                    filter(
                        None,
                        [
                            request.product_category,
                            request.material,
                            request.sector,
                            request.application,
                        ],
                    )
                ).split()
                if len(w.strip()) > 2
            ],
            confidence=1.0 if request.product_category and request.sector else 0.6,
            source="manual",
            notes=["Structured fields were used as-is (NLP extraction skipped)."],
        )
    stages.append(
        PipelineStage(
            key="extraction",
            label="Extracting requirements",
            status="completed",
            detail=(
                f"product={extraction.product or 'n/a'}; sector={extraction.sector or 'n/a'}; "
                f"material={extraction.material or 'n/a'}; {len(extraction.requirements)} requirement(s); "
                f"confidence {extraction.confidence:.0%}"
            ),
            duration_ms=round((time.perf_counter() - t0) * 1000, 2),
        )
    )

    # --- Steps 4-8: search, score, rank, explain ----------------------- #
    scored, engine_stages, candidates = engine.recommend(
        session,
        extraction,
        request.specification,
        top_k=request.top_k_resolved(),
    )
    stages.extend(engine_stages)

    recommendations = [
        _recommendation_out(item, extraction, rank=index)
        for index, item in enumerate(scored, start=1)
    ]

    knowledge_base_size = int(
        session.execute(select(func.count()).select_from(Standard)).scalar_one()
    )
    processing_ms = int((time.perf_counter() - started) * 1000)

    top = recommendations[0] if recommendations else None
    top_is_number = top.standard.is_number if top else None
    top_score = top.match_score if top else None

    query_id = 0
    if request.persist:
        row = _build_query_row(request, extraction, processing_ms)
        row.recommendation_count = len(recommendations)
        row.top_is_number = top_is_number
        row.top_match_score = to_decimal(top_score) if top_score is not None else None
        if user_id is not None:
            row.user_id = user_id
        session.add(row)
        session.flush()

        for item, payload in zip(scored, recommendations):
            session.add(
                Recommendation(
                    query_id=row.id,
                    standard_id=item.standard.id,
                    rank=payload.rank,
                    match_score=to_decimal(payload.match_score),
                    semantic_score=to_decimal(payload.semantic_score),
                    keyword_score=to_decimal(payload.keyword_score),
                    product_score=to_decimal(payload.product_score),
                    sector_score=to_decimal(payload.sector_score),
                    requirement_score=to_decimal(payload.requirement_score),
                    application_score=to_decimal(payload.application_score),
                    matched_requirements=json.dumps(
                        payload.evidence.matched_requirements if payload.evidence else [],
                        ensure_ascii=False,
                    ),
                    matched_keywords=json.dumps(
                        payload.evidence.matched_keywords if payload.evidence else [],
                        ensure_ascii=False,
                    ),
                    reason=payload.reason,
                )
            )
            payload.query_id = row.id
        query_id = int(row.id)
        logger.info(
            "Analysis stored as query #%s (%.0f ms, %d recommendations)",
            query_id,
            processing_ms,
            len(recommendations),
        )
    else:
        logger.info("Analysis completed without persistence (persist=false)")

    return AnalyzeResponse(
        query_id=query_id,
        specification=request.specification,
        extraction=extraction,
        recommendations=recommendations,
        total_candidates=candidates,
        knowledge_base_size=knowledge_base_size,
        pipeline=stages,
        processing_ms=float(processing_ms),
        top_is_number=top_is_number,
        top_match_score=top_score,
        no_match_message=None if recommendations else NO_MATCH_MESSAGE,
        disclaimer=DISCLAIMER,
        created_at=_now(),
    )


def rescore(
    session: Session,
    query_id: int,
    *,
    top_k: int,
    overrides: ExtractedRequirements | None,
) -> RecommendationResponse:
    """Re-run scoring for a stored query (optionally with edited extraction)."""
    started = time.perf_counter()
    query = session.get(ProcurementQuery, query_id)
    if query is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(
            f"Search history entry {query_id} was not found.", details={"query_id": query_id}
        )

    extraction = overrides or _extraction_from_row(query)
    if overrides is not None:
        _apply_overrides(query, overrides)

    scored, _stages, candidates = engine.recommend(
        session, extraction, query.specification, top_k=top_k
    )
    recommendations = [
        _recommendation_out(item, extraction, rank=index)
        for index, item in enumerate(scored, start=1)
    ]

    # Replace the stored recommendations so the UI and the DB never disagree.
    for existing in list(query.recommendations):
        session.delete(existing)
    session.flush()
    for item, payload in zip(scored, recommendations):
        session.add(
            Recommendation(
                query_id=query.id,
                standard_id=item.standard.id,
                rank=payload.rank,
                match_score=to_decimal(payload.match_score),
                semantic_score=to_decimal(payload.semantic_score),
                keyword_score=to_decimal(payload.keyword_score),
                product_score=to_decimal(payload.product_score),
                sector_score=to_decimal(payload.sector_score),
                requirement_score=to_decimal(payload.requirement_score),
                application_score=to_decimal(payload.application_score),
                matched_requirements=json.dumps(
                    payload.evidence.matched_requirements if payload.evidence else [],
                    ensure_ascii=False,
                ),
                matched_keywords=json.dumps(
                    payload.evidence.matched_keywords if payload.evidence else [],
                    ensure_ascii=False,
                ),
                reason=payload.reason,
            )
        )
        payload.query_id = query.id

    top = recommendations[0] if recommendations else None
    query.recommendation_count = len(recommendations)
    query.top_is_number = top.standard.is_number if top else None
    query.top_match_score = to_decimal(top.match_score) if top else None
    query.extraction_confidence = Decimal(str(extraction.confidence))
    session.flush()

    return RecommendationResponse(
        query_id=query.id,
        specification=query.specification,
        extraction=extraction,
        recommendations=recommendations,
        weights=dict(settings.weights),
        processing_ms=round((time.perf_counter() - started) * 1000, 2),
        no_match_message=None if recommendations else NO_MATCH_MESSAGE,
        disclaimer=DISCLAIMER,
    )


def _extraction_from_row(query: ProcurementQuery) -> ExtractedRequirements:
    from app.services.standards import decode_json_list

    requirements = decode_json_list(query.extracted_requirements)
    try:
        parameters = json.loads(query.extracted_parameters or "{}")
    except (TypeError, ValueError):
        parameters = {}
    if not isinstance(parameters, dict):
        parameters = {}
    return ExtractedRequirements(
        product=query.extracted_product,
        material=query.extracted_material,
        application=query.extracted_application,
        sector=query.extracted_sector,
        category=query.extracted_product,
        quantity=query.quantity,
        requirements=requirements,
        keywords=sorted({w.lower() for r in requirements for w in r.split() if len(w) > 3})[:25],
        parameters=parameters,
        confidence=float(query.extraction_confidence or 0),
        source="nlp" if requirements else "manual",
    )


def _apply_overrides(query: ProcurementQuery, overrides: ExtractedRequirements) -> None:
    query.extracted_product = overrides.product
    query.extracted_material = overrides.material
    query.extracted_application = overrides.application
    query.extracted_sector = overrides.sector
    query.extracted_requirements = json.dumps(overrides.requirements, ensure_ascii=False)
    query.extracted_parameters = json.dumps(overrides.parameters, ensure_ascii=False)


def _now():
    import datetime as dt

    return dt.datetime.now()


def rebuild_index(session: Session) -> dict[str, object]:
    """Force a vector index rebuild (exposed through /api/health?rebuild=1)."""
    vector_store.invalidate()
    return vector_store.build_from_database(session, force=True)
