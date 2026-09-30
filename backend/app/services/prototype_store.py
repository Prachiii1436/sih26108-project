"""SQLite storage for the SIH26108 *applicability* prototype module.

The historical recommendation engine keeps its data in MySQL. The applicability
demonstrator is deliberately self-contained:

* the curated **Prototype Standards Knowledge Base** is authored as a plain JSON
  file (``data/prototype_standards.json``) and mirrored into a SQLite table so
  the prototype really does run on a file database, and
* officer review decisions (accept / reject / modify) are appended to the same
  SQLite file.

Nothing here talks to MySQL, so the demonstrator can be shown even when the
main knowledge base import has not been run.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from app.core.config import BACKEND_DIR, settings
from app.core.logging import get_logger

logger = get_logger(__name__)

DATA_FILE = BACKEND_DIR.parent / "data" / "prototype_standards.json"
DB_PATH = Path(settings.var_dir) / "prototype.db"

_LOCK = threading.Lock()
_RECORDS: list[dict[str, Any]] | None = None
_META: dict[str, Any] = {}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS prototype_standards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kb_id         TEXT    NOT NULL UNIQUE,
    is_number     TEXT    NOT NULL,
    edition       TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    product_family TEXT   NOT NULL,
    record_json   TEXT    NOT NULL,
    kb_version    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS officer_reviews (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT    NOT NULL,
    user_id       TEXT,
    specification TEXT    NOT NULL,
    requirements  TEXT    NOT NULL,
    kb_id         TEXT    NOT NULL,
    is_number     TEXT    NOT NULL,
    edition       TEXT    NOT NULL,
    reported_status TEXT  NOT NULL,
    decision      TEXT    NOT NULL,
    note          TEXT
);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def load_knowledge_base(*, force_reload: bool = False) -> list[dict[str, Any]]:
    """Return the curated records, seeding SQLite from the JSON source file."""
    global _RECORDS, _META
    with _LOCK:
        if _RECORDS is not None and not force_reload:
            return _RECORDS

        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        standards: list[dict[str, Any]] = raw.get("standards", [])
        kb_version = str(raw.get("kb_version", "0"))
        _META = {
            "label": raw.get("label", "Prototype Standards Knowledge Base"),
            "notice": raw.get("notice", ""),
            "kb_version": kb_version,
            "size": len(standards),
            "source_file": str(DATA_FILE),
        }

        try:
            with _connect() as conn:
                conn.executescript(_SCHEMA)
                stored = {
                    row["kb_id"]: row["kb_version"]
                    for row in conn.execute("SELECT kb_id, kb_version FROM prototype_standards")
                }
                needs_seed = set(stored) != {s["id"] for s in standards} or any(
                    v != kb_version for v in stored.values()
                )
                if needs_seed or force_reload:
                    conn.execute("DELETE FROM prototype_standards")
                    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
                    conn.executemany(
                        """
                        INSERT INTO prototype_standards
                            (kb_id, is_number, edition, title, status, product_family,
                             record_json, kb_version, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            (
                                s["id"],
                                s["is_number"],
                                s["edition"],
                                s["title"],
                                s["status"],
                                s.get("product_family", ""),
                                json.dumps(s, ensure_ascii=False),
                                kb_version,
                                now,
                            )
                            for s in standards
                        ],
                    )
                    conn.commit()
                count = conn.execute("SELECT COUNT(*) AS n FROM prototype_standards").fetchone()["n"]
                _META["sqlite_rows"] = int(count)
        except sqlite3.Error as exc:  # pragma: no cover - disk/permission issues
            logger.warning("SQLite seeding failed, serving the JSON file directly: %s", exc)
            _META["sqlite_rows"] = 0

        _RECORDS = standards
        logger.info(
            "Prototype standards knowledge base loaded: %d records (kb=%s, sqlite=%s)",
            len(standards),
            kb_version,
            DB_PATH,
        )
        return _RECORDS


def knowledge_base_meta() -> dict[str, Any]:
    load_knowledge_base()
    meta = dict(_META)
    meta["database"] = str(DB_PATH)
    return meta


def get_record(kb_id: str) -> dict[str, Any] | None:
    for record in load_knowledge_base():
        if record["id"] == kb_id:
            return record
    return None


def save_review(payload: dict[str, Any]) -> int:
    """Append an officer review decision; returns the new row id."""
    load_knowledge_base()
    with _LOCK, _connect() as conn:
        conn.executescript(_SCHEMA)
        cursor = conn.execute(
            """
            INSERT INTO officer_reviews
                (created_at, user_id, specification, requirements, kb_id, is_number,
                 edition, reported_status, decision, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                payload.get("user_id"),
                payload.get("specification", ""),
                json.dumps(payload.get("requirements", {}), ensure_ascii=False),
                payload.get("kb_id", ""),
                payload.get("is_number", ""),
                payload.get("edition", ""),
                payload.get("reported_status", ""),
                payload.get("decision", ""),
                payload.get("note"),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)


def list_reviews(limit: int = 50) -> list[dict[str, Any]]:
    load_knowledge_base()
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        rows = conn.execute(
            "SELECT * FROM officer_reviews ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        try:
            item["requirements"] = json.loads(item.get("requirements") or "{}")
        except json.JSONDecodeError:  # pragma: no cover - defensive
            item["requirements"] = {}
        out.append(item)
    return out


__all__ = [
    "DATA_FILE",
    "DB_PATH",
    "get_record",
    "knowledge_base_meta",
    "list_reviews",
    "load_knowledge_base",
    "save_review",
]
