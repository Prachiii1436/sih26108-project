"""Domain exceptions mapped to HTTP status codes by the API layer.

The API layer never lets a raw ``SQLAlchemy`` / ``FAISS`` / network exception
reach the client as a 500 with a stack trace. Every expected failure mode has a
named exception here with a human readable, safe message.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for every error the application raises on purpose."""

    status_code: int = 500
    error_code: str = "internal_error"
    message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
        error_code: str | None = None,
    ) -> None:
        self.message = message or self.__class__.message
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        super().__init__(self.message)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"error_code": self.error_code, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return payload


class ValidationError(AppError):
    status_code = 422
    error_code = "validation_error"
    message = "The submitted data is invalid."


class NotFoundError(AppError):
    status_code = 404
    error_code = "not_found"
    message = "The requested resource was not found."


class DatabaseUnavailableError(AppError):
    """MySQL could not be reached (XAMPP not started, wrong port, bad password)."""

    status_code = 503
    error_code = "database_unavailable"
    message = (
        "The standards database is currently unavailable. "
        "Verify that MySQL is running in XAMPP and that the MYSQL_* settings in "
        "backend/.env match your environment."
    )


class EngineNotReadyError(AppError):
    """The semantic index / embedding model is not usable yet."""

    status_code = 503
    error_code = "engine_not_ready"
    message = (
        "The recommendation engine is still preparing. "
        "Run scripts/import_standards.py to build the knowledge base and vector index."
    )


class ExternalServiceError(AppError):
    """An optional third-party AI provider failed or is misconfigured."""

    status_code = 502
    error_code = "external_service_error"
    message = "An external AI service could not be reached."


class NoMatchError(AppError):
    """Nothing in the current knowledge base cleared the relevance threshold."""

    status_code = 200  # a valid, well-defined outcome - not an error
    error_code = "no_relevant_match"
    message = "No sufficiently relevant standard was found in the current knowledge base."
