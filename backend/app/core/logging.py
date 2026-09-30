"""Structured application logging.

Logs go to stdout so that Uvicorn's own handlers pick them up when running with
``uvicorn app.main:app --reload``. No log file is written by default (keeps the
repo clean); set ``LOG_LEVEL=DEBUG`` for verbose request logging.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from app.core.config import settings

_CONFIGURED = False

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-38s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class _ContextFilter(logging.Filter):
    """Adds a ``stage`` attribute so pipeline steps can be traced."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "stage"):
            record.stage = ""  # type: ignore[attr-defined]
        return True


def setup_logging(level: str | None = None) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    resolved = (level or settings.log_level).upper()
    logging.basicConfig(
        level=getattr(logging, resolved, logging.INFO),
        format=_LOG_FORMAT,
        datefmt=_DATE_FORMAT,
        stream=sys.stdout,
        force=True,
    )
    logging.getLogger().addFilter(_ContextFilter())
    # Third-party noise control.
    for noisy in ("uvicorn.access", "sentence_transformers", "transformers", "faiss"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)


def log_stage(logger: logging.Logger, stage: str, message: str, **fields: Any) -> None:
    """Log a pipeline step with structured ``stage=`` context."""
    extra = {"stage": stage, **fields}
    logger.info("[%s] %s %s", stage, message, fields if fields else "")
    del extra
