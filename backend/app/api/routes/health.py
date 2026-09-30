"""``GET /api/health`` - dependency + engine status, never raises."""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.exceptions import AppError, DatabaseUnavailableError
from app.core.logging import get_logger
from app.database.session import check_database
from app.ml.embeddings import embedding_service
from app.ml.vector_store import vector_store
from app.schemas.history import HealthResponse
from app.services.analysis import DISCLAIMER

logger = get_logger(__name__)

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health, database reachability and engine state",
)
def health(rebuild: bool = Query(False, description="Force a vector index rebuild.")) -> Any:
    db_ok, db_message, db_details = check_database()

    engine_details: dict[str, Any] = {
        **vector_store.status(),
        "embedding_model": embedding_service.model_name,
        "embedding_backend": embedding_service.backend_name,
        "embedding_dim": embedding_service.dim,
        "embedding_is_fallback": embedding_service.is_fallback,
        "embedding_load_error": embedding_service.load_error,
    }

    if rebuild and db_ok:
        from app.database.session import session_scope

        try:
            with session_scope() as session:
                vector_store.invalidate()
                vector_store.build_from_database(session, force=True)
            engine_details.update(vector_store.status())
        except SQLAlchemyError as exc:
            logger.warning("Index rebuild on health check failed: %s", exc)

    status_value = "ok" if db_ok and vector_store.is_ready else ("degraded" if db_ok else "unavailable")

    return HealthResponse(
        status=status_value,
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        timestamp=dt.datetime.now(),
        database={"ok": db_ok, "message": db_message, **db_details},
        engine=engine_details,
        configuration=settings.public_dict(),
        disclaimer=DISCLAIMER,
    )


@router.get("/health/errors", summary="Known failure modes and how to resolve them")
def error_catalogue() -> dict[str, Any]:
    """Operator-facing help: every error code the API can return."""
    return {
        "codes": [
            {
                "error_code": AppError.error_code,
                "status": 500,
                "meaning": "Unexpected server error.",
            },
            {
                "error_code": "validation_error",
                "status": 422,
                "meaning": "The request body failed validation (too short, wrong type, out of range).",
            },
            {
                "error_code": "not_found",
                "status": 404,
                "meaning": "The requested record does not exist in the knowledge base.",
            },
            {
                "error_code": "database_unavailable",
                "status": 503,
                "meaning": (
                    "MySQL is unreachable. Start it in XAMPP and confirm the port in "
                    "backend/.env (XAMPP users commonly run 3307, not 3306)."
                ),
            },
            {
                "error_code": "engine_not_ready",
                "status": 503,
                "meaning": (
                    "The knowledge base is empty. Import database/sih26108.sql and run "
                    "scripts/import_standards.py to build the vector index."
                ),
            },
            {
                "error_code": "external_service_error",
                "status": 502,
                "meaning": "The optional AI provider configured in AI_PROVIDER failed.",
            },
            {
                "error_code": "no_relevant_match",
                "status": 200,
                "meaning": (
                    "Nothing in the current knowledge base cleared the relevance threshold. "
                    "This is NOT a statement that no Indian Standard exists."
                ),
            },
        ],
        "xamppp_note": (
            "FastAPI runs on port 8000 and is not controlled by .htaccess. Apache only "
            "serves the built React app and may reverse-proxy /api to Uvicorn."
        ),
    }


@router.get("/meta", summary="Static reference data used by the UI forms")
def meta() -> dict[str, Any]:
    from app.services.nlp import APPLICATION_LEXICON, PRODUCT_LEXICON, SECTOR_LEXICON

    return {
        "sectors": sorted(SECTOR_LEXICON),
        "applications": sorted(APPLICATION_LEXICON),
        "product_hints": sorted(PRODUCT_LEXICON)[:40],
        "min_relevance": settings.min_relevance,
        "default_top_k": settings.default_top_k,
        "max_top_k": settings.max_top_k,
        "min_specification_length": settings.min_specification_length,
        "weights": settings.weights,
        "disclaimer": DISCLAIMER,
    }
