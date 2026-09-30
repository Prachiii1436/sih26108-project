"""FastAPI application factory for SIH26108.

    SIH26108 - AI-Powered Recommendation Engine for Identifying Applicable
    Indian Standards for Procurement Specifications.

    This is a Smart India Hackathon prototype / research decision-support system.
    It is NOT an official Bureau of Indian Standards (BIS) product, is not
    affiliated with or endorsed by BIS, and produces no certification or
    compliance decision.

Run with:
    uvicorn app.main:app --reload --port 8000
    (or) python run.py
"""

from __future__ import annotations

import datetime as dt
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import RedirectResponse

from app.api.middleware import register_exception_handlers, register_middleware
from app.api.router import api_router
from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.database.session import check_database, session_scope
from app.ml.embeddings import embedding_service
from app.ml.vector_store import vector_store
from app.services.analysis import DISCLAIMER

logger = get_logger(__name__)

PROJECT_URL = "https://www.bis.gov.in"
TAGS_METADATA: list[dict[str, Any]] = [
    {
        "name": "analysis",
        "description": (
            "NLP requirement extraction, sentence-transformer embeddings, FAISS semantic "
            "search and multi-factor relevance scoring."
        ),
    },
    {
        "name": "standards",
        "description": "Standards Explorer, standard detail and side-by-side comparison.",
    },
    {"name": "search-history", "description": "Persistent MySQL-backed search history."},
    {"name": "saved-standards", "description": "Per-officer shortlist with notes."},
    {"name": "analytics", "description": "Live aggregates for the analytics dashboard."},
    {
        "name": "system",
        "description": "Health, engine state and operator documentation.",
    },
]

DESCRIPTION = f"""
**AI-Powered Recommendation Engine for Identifying Applicable Indian Standards for
Procurement Specifications** - Smart India Hackathon prototype `SIH26108`.

Enter a natural-language procurement specification. The backend:

1. normalises and segments the text,
2. extracts product, material, application, sector and typed requirements,
3. embeds the query with `sentence-transformers/{settings.embedding_model.split('/')[-1]}`,
4. retrieves candidates with cosine similarity over a FAISS / MySQL vector index,
5. scores six factors (semantic, keyword, product, sector, requirement, application),
6. ranks, explains and persists the result in MySQL (`127.0.0.1:{settings.mysql_port}`).

> **Disclaimer** - {DISCLAIMER}
> Reference for verifying real standards: {PROJECT_URL}
"""


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    setup_logging()
    logger.info("=" * 78)
    logger.info("%s %s starting (env=%s)", settings.app_name, settings.app_version, settings.app_env)
    logger.info("Database target: %s", settings.safe_database_target())
    logger.info("CORS origins: %s", ", ".join(settings.cors_origins))

    ok, message, details = check_database()
    if ok:
        logger.info(
            "MySQL reachable (%s) - %s standards in the knowledge base",
            details.get("server_version", "unknown"),
            details.get("standards_count", 0),
        )
        try:
            with session_scope() as session:
                vector_store.build_from_database(session)
        except Exception as exc:  # noqa: BLE001 - never block startup
            logger.warning("Vector index warm-up failed (non-fatal): %s", exc)
    else:
        logger.error("MySQL NOT reachable: %s", message)
        logger.error("Start MySQL in XAMPP, then verify MYSQL_HOST/MYSQL_PORT in backend/.env")

    try:
        embedding_service.warmup()
        logger.info(
            "Embedding model ready: %s (backend=%s, dim=%d%s)",
            embedding_service.model_name,
            embedding_service.backend_name,
            embedding_service.dim,
            ", OFFLINE FALLBACK" if embedding_service.is_fallback else "",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Embedding warm-up failed: %s", exc)

    logger.info("=" * 78)
    yield
    logger.info("%s shutting down", settings.app_name)
    vector_store.invalidate()


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(
        title=f"{settings.app_name} - Indian Standards Recommendation Engine",
        description=DESCRIPTION,
        version=settings.app_version,
        openapi_tags=TAGS_METADATA,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        contact={"name": "SIH26108 project team (prototype)"},
        license_info={"name": "Provided as-is for Smart India Hackathon evaluation"},
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Process-Time-Ms"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    register_middleware(app)
    register_exception_handlers(app)

    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    @app.get("/api", include_in_schema=False)
    def api_index() -> dict[str, Any]:
        return {
            "app": settings.app_name,
            "version": settings.app_version,
            "problem_statement": "SIH26108",
            "status": "operational",
            "documentation": "/docs",
            "health": f"{settings.api_prefix}/health",
            "disclaimer": DISCLAIMER,
            "endpoints": [
                f"POST {settings.api_prefix}/analyze",
                f"POST {settings.api_prefix}/recommendations",
                f"GET  {settings.api_prefix}/standards",
                f"GET  {settings.api_prefix}/standards/{{id}}",
                f"POST {settings.api_prefix}/compare",
                f"GET  {settings.api_prefix}/search-history",
                f"POST {settings.api_prefix}/search-history",
                f"DELETE {settings.api_prefix}/search-history/{{id}}",
                f"GET  {settings.api_prefix}/saved-standards",
                f"POST {settings.api_prefix}/saved-standards",
                f"DELETE {settings.api_prefix}/saved-standards/{{id}}",
                f"GET  {settings.api_prefix}/analytics",
                f"GET  {settings.api_prefix}/health",
            ],
            "server_time": dt.datetime.now().isoformat(timespec="seconds"),
        }

    return app


app = create_app()
