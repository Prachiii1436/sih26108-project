"""``/api/saved-standards`` endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.logging import get_logger
from app.schemas.common import MessageResponse
from app.schemas.history import SavedStandardCreate, SavedStandardItem, SavedStandardUpdate
from app.services import saved as saved_service

logger = get_logger(__name__)

router = APIRouter(prefix="/saved-standards", tags=["saved-standards"])


@router.get(
    "",
    response_model=list[SavedStandardItem],
    summary="List the shortlist of saved standards",
)
def list_saved(
    session: DbSession,
    user: CurrentUser,
    search: Annotated[str | None, Query()] = None,
    tag: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[SavedStandardItem]:
    items, _total = saved_service.list_saved(
        session, user_id=user, search=search, tag=tag, page=page, page_size=page_size
    )
    return items


@router.get(
    "/tags",
    summary="Distinct tags used in the shortlist",
)
def saved_tags(session: DbSession, user: CurrentUser) -> dict[str, list[str]]:
    return {"tags": saved_service.saved_tags(session, user_id=user)}


@router.get(
    "/ids",
    summary="Standard ids currently in the shortlist (for button state in the UI)",
)
def saved_id_list(session: DbSession, user: CurrentUser) -> dict[str, list[int]]:
    return {"standard_ids": sorted(saved_service.saved_ids(session, user_id=user))}


@router.post(
    "",
    response_model=SavedStandardItem,
    status_code=status.HTTP_201_CREATED,
    summary="Save a standard to the shortlist (idempotent)",
    responses={
        404: {"description": "Unknown standard id."},
        422: {"description": "Invalid standard or duplicate entry."},
    },
)
def save_standard(
    payload: SavedStandardCreate, session: DbSession, user: CurrentUser
) -> SavedStandardItem:
    return saved_service.save_standard(session, payload, user_id=user)


@router.get(
    "/{saved_id}",
    response_model=SavedStandardItem,
    summary="One shortlist entry",
    responses={404: {"description": "Unknown shortlist entry."}},
)
def get_saved(
    session: DbSession,
    user: CurrentUser,
    saved_id: Annotated[int, Path(ge=1)],
) -> SavedStandardItem:
    return saved_service.get_saved(session, saved_id, user_id=user)


@router.patch(
    "/{saved_id}",
    response_model=SavedStandardItem,
    summary="Edit the notes / tag of a shortlist entry",
    responses={404: {"description": "Unknown shortlist entry."}},
)
def update_saved(
    payload: SavedStandardUpdate,
    session: DbSession,
    user: CurrentUser,
    saved_id: Annotated[int, Path(ge=1)],
) -> SavedStandardItem:
    return saved_service.update_saved(session, saved_id, payload, user_id=user)


@router.delete(
    "/{saved_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a standard from the shortlist",
    responses={404: {"description": "Unknown shortlist entry."}},
)
def delete_saved(
    session: DbSession,
    user: CurrentUser,
    saved_id: Annotated[int, Path(ge=1)],
) -> Response:
    saved_service.delete_saved(session, saved_id, user_id=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
