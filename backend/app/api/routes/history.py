"""``/api/search-history`` endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.logging import get_logger
from app.schemas.common import MessageResponse
from app.schemas.history import (
    SearchHistoryCreate,
    SearchHistoryItem,
    SearchHistoryListResponse,
    SearchHistoryUpdate,
)
from app.services import history as history_service

logger = get_logger(__name__)

router = APIRouter(prefix="/search-history", tags=["search-history"])


@router.get(
    "",
    response_model=SearchHistoryListResponse,
    summary="List every analysed procurement query (persistent search history)",
)
def list_history(
    session: DbSession,
    user: CurrentUser,
    search: Annotated[str | None, Query()] = None,
    sector: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 15,
    include_recommendations: Annotated[bool, Query()] = False,
) -> SearchHistoryListResponse:
    return history_service.list_history(
        session,
        user_id=user,
        search=search,
        sector=sector,
        page=page,
        page_size=page_size,
        include_recommendations=include_recommendations,
    )


@router.post(
    "",
    response_model=SearchHistoryItem,
    status_code=status.HTTP_201_CREATED,
    summary="Record a procurement query manually",
    responses={422: {"description": "The specification is too short or invalid."}},
)
def create_history(
    payload: SearchHistoryCreate, session: DbSession, user: CurrentUser
) -> SearchHistoryItem:
    return history_service.create_history(session, payload, user_id=user)


@router.get(
    "/{query_id}",
    response_model=SearchHistoryItem,
    summary="One history entry including its stored recommendations",
    responses={404: {"description": "Unknown query id."}},
)
def get_history(
    session: DbSession,
    user: CurrentUser,
    query_id: Annotated[int, Path(ge=1)],
) -> SearchHistoryItem:
    return history_service.get_history_item(session, query_id, user_id=user)


@router.patch(
    "/{query_id}",
    response_model=SearchHistoryItem,
    summary="Update the status / append a procurement note",
    responses={404: {"description": "Unknown query id."}},
)
def update_history(
    payload: SearchHistoryUpdate,
    session: DbSession,
    user: CurrentUser,
    query_id: Annotated[int, Path(ge=1)],
) -> SearchHistoryItem:
    return history_service.update_history(session, query_id, payload, user_id=user)


@router.delete(
    "/{query_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a history entry and its recommendations",
    responses={404: {"description": "Unknown query id."}},
)
def delete_history(
    session: DbSession,
    user: CurrentUser,
    query_id: Annotated[int, Path(ge=1)],
) -> Response:
    history_service.delete_history(session, query_id, user_id=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/meta/sectors",
    summary="Sectors present in the stored history (for the filter dropdown)",
)
def history_sectors(session: DbSession) -> dict[str, list[str]]:
    return history_service.history_facets(session)
