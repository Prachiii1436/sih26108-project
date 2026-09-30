"""API router aggregation - every route is mounted under ``/api``."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    analyze,
    analytics,
    applicability,
    health,
    history,
    saved_standards,
    standards,
)

api_router = APIRouter()

# Order matters only for documentation; FastAPI matches by path.
api_router.include_router(health.router)
api_router.include_router(analyze.router)
api_router.include_router(applicability.router)
api_router.include_router(standards.router)
api_router.include_router(history.router)
api_router.include_router(saved_standards.router)
api_router.include_router(analytics.router)

__all__ = ["api_router"]
