"""``GET /api/standards``, ``GET /api/standards/{id}`` and ``POST /api/compare``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.api.deps import CurrentUser, DbSession
from app.core.logging import get_logger
from app.schemas.standard import (
    CompareRequest,
    CompareResponse,
    StandardDetail,
    StandardFacets,
    StandardListResponse,
)
from app.services import standards as standards_service

logger = get_logger(__name__)

router = APIRouter(tags=["standards"])


@router.get(
    "/standards",
    response_model=StandardListResponse,
    summary="Search and filter the standards knowledge base",
)
def list_standards(
    session: DbSession,
    user: CurrentUser,
    search: Annotated[str | None, Query(description="Free text across number/title/scope/keywords")] = None,
    sector: Annotated[list[str] | None, Query()] = None,
    category: Annotated[list[str] | None, Query()] = None,
    status_filter: Annotated[list[str] | None, Query(alias="status")] = None,
    year_min: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    year_max: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    product: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
    sort: Annotated[
        str,
        Query(pattern="^(relevance|is_number_asc|is_number_desc|title_asc|year_desc|year_asc|sector_asc|updated_desc)$"),
    ] = "is_number_asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> StandardListResponse:
    return standards_service.list_standards(
        session,
        search=search,
        sector=sector,
        category=category,
        year_min=year_min,
        year_max=year_max,
        status=status_filter,
        product=product,
        keyword=keyword,
        sort=sort,
        page=page,
        page_size=page_size,
        user_id=user,
    )


@router.get(
    "/standards/facets",
    response_model=StandardFacets,
    summary="Distinct sectors, categories, statuses and years for the filter UI",
)
def facets(session: DbSession) -> StandardFacets:
    return standards_service.get_facets(session)


@router.get(
    "/standards/{standard_id}",
    response_model=StandardDetail,
    summary="Full record: scope, requirements, keywords, related standards",
    responses={404: {"description": "Unknown standard id."}},
)
def get_standard(
    session: DbSession,
    user: CurrentUser,
    standard_id: Annotated[int, Path(ge=1)],
) -> StandardDetail:
    return standards_service.get_standard(session, standard_id, user_id=user)


@router.post(
    "/compare",
    response_model=CompareResponse,
    summary="Compare 2-4 standards side by side",
    responses={
        404: {"description": "One of the standards does not exist."},
        422: {"description": "Fewer than 2 or more than 4 standards were supplied."},
    },
)
def compare(payload: CompareRequest, session: DbSession) -> CompareResponse:
    result = standards_service.compare_standards(
        session, payload.standard_ids, query_id=payload.query_id
    )
    logger.info(
        "POST /compare -> %s", ", ".join(s.is_number for s in result.standards)
    )
    return result
