"""``POST /api/analyze`` and ``POST /api/recommendations``."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.exceptions import EngineNotReadyError
from app.core.logging import get_logger
from app.models import Standard
from app.schemas.analysis import (
    AnalyzeRequest,
    AnalyzeResponse,
    RecommendationRequest,
    RecommendationResponse,
)
from app.services import analysis as analysis_service

logger = get_logger(__name__)

router = APIRouter(tags=["analysis"])


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyse a procurement specification and return ranked standards",
    responses={
        422: {"description": "The specification failed validation."},
        503: {"description": "Database unavailable or knowledge base empty."},
    },
)
def analyze(
    payload: AnalyzeRequest, session: DbSession, user: CurrentUser
) -> AnalyzeResponse:
    """Runs the real pipeline: extraction -> embeddings -> FAISS -> scoring -> DB."""
    knowledge_base_size = _knowledge_base_size(session)
    if knowledge_base_size == 0:
        raise EngineNotReadyError(
            "The standards knowledge base is empty. Import database/sih26108.sql via "
            "phpMyAdmin, then run: python scripts/import_standards.py "
            "--csv data/sample_standards.csv"
        )

    response = analysis_service.analyze(session, payload, user_id=user)
    logger.info(
        "POST /analyze -> %d recommendations (top %s @ %.1f%%) in %.0f ms",
        len(response.recommendations),
        response.top_is_number or "-",
        response.top_match_score or 0.0,
        response.processing_ms,
    )
    return response


@router.post(
    "/recommendations",
    response_model=RecommendationResponse,
    summary="Re-score a stored query (optionally with manually edited extraction)",
    responses={404: {"description": "Unknown query id."}},
)
def recommendations(
    payload: RecommendationRequest, session: DbSession, user: CurrentUser
) -> RecommendationResponse:
    """Used by the 'Re-analyse' button after the user edits extracted fields."""
    return analysis_service.rescore(
        session, payload.query_id, top_k=payload.top_k_resolved(), overrides=payload.overrides
    )


@router.post(
    "/analyze/extract",
    summary="Run only the NLP requirement-extraction stage (fast, no scoring)",
)
def extract_only(payload: AnalyzeRequest) -> dict:
    """Lets the New Query page show extracted attributes before committing to a search."""
    extraction = analysis_service.run_extraction(payload)
    return {
        "extraction": extraction,
        "pipeline": [
            {
                "key": "extraction",
                "label": "Extracting requirements",
                "status": "completed",
                "detail": (
                    f"product={extraction.product or 'n/a'}; sector={extraction.sector or 'n/a'}; "
                    f"confidence {extraction.confidence:.0%}"
                ),
            }
        ],
        "min_relevance": settings.min_relevance,
    }


def _knowledge_base_size(session: DbSession) -> int:
    from sqlalchemy import func, select

    return int(session.execute(select(func.count()).select_from(Standard)).scalar_one())
