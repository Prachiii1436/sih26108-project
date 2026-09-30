"""``GET /api/analytics`` - every figure is a live MySQL aggregate."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.core.logging import get_logger
from app.schemas.history import AnalyticsResponse
from app.services.analytics import build_analytics

logger = get_logger(__name__)

router = APIRouter(tags=["analytics"])


@router.get(
    "/analytics",
    response_model=AnalyticsResponse,
    summary="Dashboard aggregates: totals, sectors, products, score distribution",
)
def analytics(
    session: DbSession,
    user: CurrentUser,
    days: Annotated[int, Query(ge=7, le=180, description="Window for the daily trend")] = 30,
) -> AnalyticsResponse:
    result = build_analytics(session, days=days)
    logger.info(
        "GET /analytics -> %d queries, %d recommendations, avg score %.1f%%",
        result.summary.total_queries,
        result.summary.total_recommendations,
        result.summary.average_match_score,
    )
    return result
