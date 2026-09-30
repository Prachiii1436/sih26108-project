"""Shared FastAPI dependencies."""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import auth_is_required, resolve_user_email, resolve_user_id
from app.database.session import get_db

logger = get_logger(__name__)

DbSession = Annotated[Session, Depends(get_db)]


def current_user(
    request: Request,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_email: Annotated[str | None, Header(alias="X-User-Email")] = None,
) -> int | None:
    """Resolve the acting user.

    Demo mode: any ``X-User-Id`` header is accepted as a user id so history and
    shortlists can be exercised per-officer. Set ``AUTH_REQUIRED=true`` to make
    a missing header a hard 401 - wire a real IdP/JWT verifier in front of this
    function before exposing the service outside a trusted network.
    """
    headers: dict[str, str] = {}
    if x_user_id:
        headers["x-user-id"] = x_user_id
    if x_user_email:
        headers["x-user-email"] = x_user_email
    user_id = resolve_user_id(headers)
    email = resolve_user_email(headers)

    if auth_is_required() and user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Authentication is required (AUTH_REQUIRED=true). "
                "Send an X-User-Id header or integrate an identity provider."
            ),
        )
    request.state.user_email = email
    return user_id


CurrentUser = Annotated[int | None, Depends(current_user)]


def pagination(page: int = 1, page_size: int = 20) -> tuple[int, int]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    return page, page_size


Pagination = Annotated[tuple[int, int], Depends(pagination)]
