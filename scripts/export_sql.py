#!/usr/bin/env python
"""Regenerate the DEMONSTRATION DATA section of ``database/sih26108.sql``.

Why this exists
---------------
``database/sih26108.sql`` is the file most users import through phpMyAdmin, so it
has to stay byte-for-byte consistent with what ``scripts/import_standards.py``
produces from ``data/sample_standards.csv``. Hand-maintaining hundreds of
INSERT statements guarantees the two drift apart (an earlier revision of the SQL
split requirements such as ``"Marking of IS number, size and manufacturer"``
on the comma, while the importer split only on ``;``).

This script reads the *authoritative* rows back out of MySQL and rewrites the
seed section of the SQL file, so the phpMyAdmin import path and the importer
path can never disagree.

Usage
-----
    python scripts/export_sql.py                 # rewrite database/sih26108.sql
    python scripts/export_sql.py --dry-run       # show what would change
    python scripts/export_sql.py --check         # exit 1 if the file is stale

Only the data section is touched - the schema, the demo user and the trailing
verification comments are preserved verbatim.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
SQL_PATH = REPO_ROOT / "database" / "sih26108.sql"

# Markers delimiting the regenerable block inside the SQL file. These are matched
# as *whole stripped lines* so they can never be hit by the word "DEMONSTRATION
# DATA" that also appears inside every seeded row's `source` column.
BEGIN_MARKER = "--  DEMONSTRATION DATA"
TAIL_MARKER = "--  Optional demo user (single-user local prototype, no password => no login)."
BANNER_PREFIX = "-- ==="

sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.database.session import get_session_factory  # noqa: E402

logger = get_logger("export_sql")

DEMO_HEADER = """-- =============================================================================
--  DEMONSTRATION DATA
--  ---------------------------------------------------------------------------
--  Generated from data/sample_standards.csv via scripts/import_standards.py.
--  Regenerate with:  python scripts/export_sql.py
--
--  >>> DEMONSTRATION DATA - placeholder metadata written for the SIH26108
--  >>> prototype so the application runs out of the box.
--  >>> These are NOT verified BIS records. Replace with verified / licensed
--  >>> metadata before any real-world deployment. Verify any real requirement
--  >>> against https://www.bis.gov.in
--  =============================================================================
"""


def _quote(value: object) -> str:
    """Render a Python value as a MySQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    escaped = (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\x00", "")
    )
    return f"'{escaped}'"


def _split_json_list(raw: object) -> list[str]:
    """Split a stored ``a;b;c`` (or JSON array) list column into its items."""
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        return [str(v).strip() for v in raw if str(v).strip()]
    text = str(raw).strip()
    if text.startswith("["):
        import json

        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except json.JSONDecodeError:
            pass
    return [part.strip() for part in text.split(";") if part.strip()]


def _requirement_type(text: str) -> str:
    """Classify a requirement clause. Mirrors ``import_standards._requirement_type``."""
    low = text.lower()
    if any(k in low for k in ("marking", "labelling", "labeling", "marked")):
        return "marking"
    if any(k in low for k in ("test", "tested", "testing", "inspection", "verified")):
        return "testing"
    if any(k in low for k in ("resistan", "safety", "protection", "impact", "fire")):
        return "safety"
    if any(k in low for k in ("material", "grade of", "made of", "composition")):
        return "material"
    if any(k in low for k in ("durab", "corrosion", "weather", "aging", "ageing")):
        return "durability"
    if any(k in low for k in ("strength", "percent", "%", "mm", "tolerance", "dimension")):
        return "performance"
    return "technical"


def _fetch_standards(session) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT id, is_number, title, sector, category, product, scope,
                   description, keywords, requirements, source, source_url,
                   year, status, revision, is_demonstration
            FROM standards
            ORDER BY is_number
            """
        )
    ).mappings()
    standards = [dict(r) for r in rows]

    keywords = session.execute(
        text(
            """
            SELECT s.is_number, k.keyword, k.weight
            FROM standard_keywords k
            JOIN standards s ON s.id = k.standard_id
            ORDER BY s.is_number, k.id
            """
        )
    ).mappings()
    by_is: dict[str, list[tuple[str, float]]] = {}
    for row in keywords:
        by_is.setdefault(row["is_number"], []).append((row["keyword"], float(row["weight"])))

    requirements = session.execute(
        text(
            """
            SELECT s.is_number, r.requirement_text, r.requirement_type, r.is_mandatory
            FROM standard_requirements r
            JOIN standards s ON s.id = r.standard_id
            ORDER BY s.is_number, r.id
            """
        )
    ).mappings()
    reqs_by_is: dict[str, list[tuple[str, str, int]]] = {}
    for row in requirements:
        reqs_by_is.setdefault(row["is_number"], []).append(
            (row["requirement_text"], row["requirement_type"], int(row["is_mandatory"]))
        )

    for std in standards:
        std["_keywords"] = by_is.get(std["is_number"], [])
        std["_requirements"] = reqs_by_is.get(std["is_number"], [])
    return standards


def _render_standard(std: dict) -> list[str]:
    columns = (
        "is_number",
        "title",
        "sector",
        "category",
        "product",
        "scope",
        "description",
        "keywords",
        "requirements",
        "source",
        "source_url",
        "year",
        "status",
        "revision",
        "is_demonstration",
    )
    values = []
    for column in columns:
        raw = std.get(column)
        if column in {"keywords", "requirements"}:
            raw = ";".join(_split_json_list(raw))
        if column == "is_demonstration":
            raw = 1 if raw else 0
        values.append(_quote(raw))
    return [
        f"-- {std['is_number']} | {std['title']}",
        "INSERT INTO `standards`",
        "({})".format(",".join(f"`{c}`" for c in columns)),
        "VALUES",
        "({});".format(",".join(values)),
        "",
    ]


def _render_keywords(std: dict) -> list[str]:
    keywords = std["_keywords"]
    if not keywords:
        return []
    union = " UNION ALL ".join(
        f"SELECT {_quote(kw)} AS `keyword`, {_quote(weight)} AS `weight`"
        for kw, weight in keywords
    )
    return [
        f"-- keywords for {std['is_number']}",
        "INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)",
        "SELECT s.`id`, t.`keyword`, t.`weight`",
        "FROM `standards` s",
        f"JOIN (\n    {union}\n) AS t ON 1 = 1",
        f"WHERE s.`is_number` = {_quote(std['is_number'])};",
        "",
    ]


def _render_requirements(std: dict) -> list[str]:
    """Render requirements via a derived-table JOIN.

    A scalar subquery is not allowed inside an ``INSERT ... VALUES`` list, and
    ``ROW_NUMBER()`` is unavailable on MySQL 5.7, so the clause codes are
    emitted literally and joined back to the parent row on ``is_number``. That
    keeps the file importable on MySQL 5.7, MySQL 8 and MariaDB alike.
    """
    requirements = std["_requirements"]
    if not requirements:
        return []
    rows = []
    for index, (text_, rtype, mandatory) in enumerate(requirements, start=1):
        rows.append(
            f"    SELECT {_quote(f'clause_{index}')} AS `requirement_code`, "
            f"{_quote(text_)} AS `requirement_text`, {_quote(rtype)} AS `requirement_type`, "
            f"{_quote(mandatory)} AS `is_mandatory`"
        )
    union = "\n    UNION ALL ".join(rows[1:])
    body = rows[0] + (f"\n    UNION ALL {union}" if union else "")
    return [
        f"-- requirements for {std['is_number']}",
        "INSERT INTO `standard_requirements`",
        "(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)",
        "SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,",
        "       t.`requirement_type`, t.`is_mandatory`",
        "FROM `standards` s",
        "JOIN (",
        body,
        ") AS t ON 1 = 1",
        f"WHERE s.`is_number` = {_quote(std['is_number'])};",
        "",
    ]


def build_block(standards: list[dict]) -> str:
    lines: list[str] = [DEMO_HEADER]
    for std in standards:
        lines.extend(_render_standard(std))
        lines.extend(_render_keywords(std))
        lines.extend(_render_requirements(std))
    return "\n".join(lines).rstrip() + "\n"


def _banner_start(lines: list[str], index: int) -> int:
    """Walk backwards from ``index`` to the first line of its banner comment."""
    while index > 0 and not lines[index - 1].startswith(BANNER_PREFIX):
        index -= 1
    return max(index - 1, 0)


def splice(original: str, block: str) -> str:
    """Replace the seed-data region of the SQL file, keeping head and tail.

    The head is everything up to (and excluding) the ``DEMONSTRATION DATA``
    banner; the tail is everything from the final "Optional demo user" banner
    onwards. Anchoring on the *last* tail marker makes the operation repair a
    previously duplicated file instead of compounding the duplication.
    """
    lines = original.splitlines()

    begin = next(
        (i for i, l in enumerate(lines) if l.strip() == BEGIN_MARKER),
        None,
    )
    if begin is None:
        raise SystemExit(f"Could not find '{BEGIN_MARKER}' in {SQL_PATH}")
    start = _banner_start(lines, begin)

    tail_index = [i for i, l in enumerate(lines) if l.strip() == TAIL_MARKER]
    if not tail_index:
        raise SystemExit(f"Could not find '{TAIL_MARKER}' in {SQL_PATH}")
    end = _banner_start(lines, tail_index[-1])

    if end <= start:
        raise SystemExit(
            f"Refusing to splice: tail marker (line {end + 1}) is not after "
            f"the data section (line {start + 1})."
        )

    head = "\n".join(lines[:start]).rstrip() + "\n\n"
    tail = "\n".join(lines[end:]).lstrip("\n")
    return head + block.rstrip() + "\n\n\n" + tail


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report only, write nothing")
    parser.add_argument("--check", action="store_true", help="Exit 1 if the SQL file is stale")
    args = parser.parse_args()

    original = SQL_PATH.read_text(encoding="utf-8")
    session_factory = get_session_factory()
    with session_factory() as session:
        standards = _fetch_standards(session)

    if not standards:
        logger.error("No standards found in the database - import the CSV first.")
        return 1

    logger.info(
        "Read %d standard(s), %d keyword(s), %d requirement(s) from %s",
        len(standards),
        sum(len(s["_keywords"]) for s in standards),
        sum(len(s["_requirements"]) for s in standards),
        settings.safe_database_target(),
    )
    updated = splice(original, build_block(standards))

    if updated == original:
        logger.info("%s is already up to date.", SQL_PATH.name)
        return 0
    if args.check:
        logger.error("%s is stale - run: python scripts/export_sql.py", SQL_PATH.name)
        return 1
    if args.dry_run:
        logger.warning("--dry-run: %s would be rewritten (%d -> %d bytes).",
                       SQL_PATH.name, len(original), len(updated))
        return 0

    SQL_PATH.write_text(updated, encoding="utf-8")
    logger.info("Rewrote %s (%d -> %d bytes).", SQL_PATH.name, len(original), len(updated))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
