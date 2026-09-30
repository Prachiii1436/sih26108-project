"""Global exception handlers + request logging middleware.

Every error the client sees goes through here, so a stack trace or a database
password can never leak into a response body.
"""

from __future__ import annotations

import datetime as dt
import time
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _envelope(
    request: Request, error_code: str, message: str, status_code: int, details: Any = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": error_code,
            "message": message,
            "details": details,
            "path": str(request.url.path),
            "timestamp": dt.datetime.now().isoformat(timespec="seconds"),
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.warning("AppError %s on %s: %s", exc.error_code, request.url.path, exc.message)
        return _envelope(
            request, exc.error_code, exc.message, exc.status_code, exc.details or None
        )

    @app.exception_handler(RequestValidationError)
    async def _request_validation(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(p) for p in err.get("loc", [])[1:]) or "body",
                "message": err.get("msg", "invalid value"),
                "type": err.get("type"),
            }
            for err in exc.errors()
        ]
        message = "The submitted data is invalid."
        if fields:
            first = fields[0]
            message = f"{first['field']}: {first['message']}"
        logger.info("Validation error on %s: %s", request.url.path, message)
        return _envelope(
            request,
            "validation_error",
            message,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"fields": fields},
        )

    @app.exception_handler(PydanticValidationError)
    async def _pydantic_validation(
        request: Request, exc: PydanticValidationError
    ) -> JSONResponse:
        return _envelope(
            request,
            "validation_error",
            "The submitted data is invalid.",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"fields": [{"field": ".".join(str(p) for p in e.get("loc", [])), "message": e.get("msg", "")} for e in exc.errors()]},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 401: "unauthorized", 403: "forbidden", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error"
        )
        return _envelope(request, code, str(exc.detail), exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s", request.url.path)
        message = (
            "An unexpected internal error occurred. The technical details were written to "
            "the server log and deliberately not returned to the client."
        )
        if settings.debug:
            message = f"{message} ({type(exc).__name__})"
        return _envelope(
            request, "internal_error", message, status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def register_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def _log_requests(request: Request, call_next):  # noqa: ANN001, ANN202
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - started) * 1000
        response.headers["X-Process-Time-Ms"] = f"{elapsed:.2f}"
        if not request.url.path.endswith("/health"):
            logger.info(
                "%s %s -> %s (%.1f ms)",
                request.method,
                request.url.path,
                response.status_code,
                elapsed,
            )
        return response
