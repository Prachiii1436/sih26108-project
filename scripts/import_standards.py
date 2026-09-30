#!/usr/bin/env python
"""Import Indian Standards metadata into MySQL and build the vector index.

Supports CSV, JSON, JSON-lines and Excel (.xlsx/.xls via pandas+openpyxl).

    python scripts/import_standards.py --csv data/sample_standards.csv
    python scripts/import_standards.py --file data/standards.xlsx --sheet Standards
    python scripts/import_standards.py --file standards.json --upsert --rebuild-index
    python scripts/import_standards.py --csv data/sample_standards.csv --dry-run

Pipeline
--------
1. read the source file
2. validate + normalise every record (required fields, types, lengths)
3. upsert into MySQL (``standards``, ``standard_keywords``, ``standard_requirements``)
4. generate sentence-transformer embeddings for each standard
5. rebuild the FAISS / MySQL vector index and persist it to ``backend/var``

Column contract (CSV/Excel/JSON)::

    is_number   * required, unique
    title       * required
    sector, category, product
    scope, description
    keywords      - "a; b; c"  or a JSON array
    requirements  - "x; y; z"  or a JSON array
    source, source_url, year, status, revision, replacement_code, is_demonstration

BIS / copyright notice
----------------------
Only import metadata you are permitted to use. This tool never downloads BIS
documents; it loads a file you supply. See ``data/README.md``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from app.database.session import check_database, session_scope  # noqa: E402
from app.ml.embeddings import compose_standard_document, embedding_service  # noqa: E402
from app.ml.vector_store import vector_store  # noqa: E402
from app.models import Standard, StandardKeyword, StandardRequirement  # noqa: E402

logger = get_logger("import_standards")

REQUIRED_FIELDS = ("is_number", "title")
VALID_STATUSES = ("Active", "Superseded", "Under Revision", "Withdrawn", "Draft")
DEMO_SOURCE_PREFIX = "DEMONSTRATION DATA"

IS_NUMBER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-/() .:]{1,63}$")

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "is_number": ("is number", "isno", "is no", "is code", "iscode", "code", "number", "standard number"),
    "title": ("title", "name", "standard title", "standard name", "description of standard"),
    "sector": ("sector", "domain", "vertical", "area"),
    "category": ("category", "subcategory", "group", "class"),
    "product": ("product", "product name", "item", "material type", "product category"),
    "scope": ("scope", "scope of standard", "scope text"),
    "description": ("description", "summary", "abstract", "about", "details", "brief"),
    "keywords": ("keywords", "keyword", "tags", "search terms", "key words"),
    "requirements": ("requirements", "requirement", "key requirements", "clauses", "specification"),
    "source": ("source", "reference", "data source", "provenance", "source reference"),
    "source_url": ("source url", "url", "link", "reference url", "source link"),
    "year": ("year", "year of issue", "published", "publication year", "year of adoption"),
    "status": ("status", "state", "current status"),
    "revision": ("revision", "rev", "amendment", "amendment no"),
    "replacement_code": ("replacement code", "replaced by", "superseded by", "replacement"),
    "is_demonstration": ("is demonstration", "demonstration", "is demo", "demo", "is placeholder"),
}

REQUIREMENT_TYPE_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("safety", ("safety", "protect", "guard", "fire resist", "non-toxic", "injury", "ppe")),
    ("testing", ("test", "inspect", "sampl", "verif", "calibrat", "certificate", "laborator")),
    ("marking", ("mark", "label", "logo", "name plate", "stamp", "brand")),
    ("material", ("material", "made of", "composition", "grade of", "fabricat")),
    ("durability", ("durab", "corrosion", "weather", "abrasion", "wear", "uv", "moisture")),
    ("performance", ("perform", "efficien", "capacity", "efficien", "output", "life")),
    ("inspection", ("inspection", "third party", "pre-shipment", "acceptance", "quality assurance")),
]


@dataclass(slots=True)
class StandardRecord:
    is_number: str
    title: str
    sector: str = "General"
    category: str = "General"
    product: str | None = None
    scope: str | None = None
    description: str | None = None
    keywords: list[str] = field(default_factory=list)
    requirements: list[str] = field(default_factory=list)
    source: str | None = None
    source_url: str | None = None
    year: int | None = None
    status: str = "Active"
    revision: str | None = None
    replacement_code: str | None = None
    is_demonstration: bool = True

    def document(self) -> str:
        return compose_standard_document(
            title=self.title,
            sector=self.sector,
            category=self.category,
            product=self.product,
            scope=self.scope,
            description=self.description,
            keywords=self.keywords,
            requirements=self.requirements,
        )


class ValidationIssue(Exception):
    pass


# --------------------------------------------------------------------------- #
#  Reading
# --------------------------------------------------------------------------- #
def _normalise_key(key: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(key or "").strip().lower()).strip()


def _canonical_key(key: Any) -> str | None:
    normalised = _normalise_key(key)
    for canonical, aliases in COLUMN_ALIASES.items():
        if normalised in aliases:
            return canonical
    return None


def read_records(path: Path, sheet: str | None = None) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix in {".csv", ".txt"}:
        return _read_csv(path)
    if suffix in {".json"}:
        return _read_json(path)
    if suffix in {".jsonl", ".ndjson"}:
        return _read_jsonl(path)
    if suffix in {".xlsx", ".xls", ".xlsm"}:
        return _read_excel(path, sheet)
    raise ValidationIssue(
        f"Unsupported file type '{suffix}'. Use .csv, .json, .jsonl, .xlsx or .xls"
    )


def _read_csv(path: Path) -> list[dict[str, Any]]:
    import pandas as pd

    frame = pd.read_csv(path, dtype=str, keep_default_na=False, skipinitialspace=True)
    return frame.to_dict(orient="records")


def _read_excel(path: Path, sheet: str | None) -> list[dict[str, Any]]:
    import pandas as pd

    frame = pd.read_excel(path, sheet_name=sheet or 0, dtype=str)
    frame = frame.fillna("")
    return frame.to_dict(orient="records")


def _read_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        for key in ("standards", "records", "data", "items"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            data = [data]
    if not isinstance(data, list):
        raise ValidationIssue("JSON file must contain a list of standard objects")
    return [row for row in data if isinstance(row, dict)]


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValidationIssue(f"Invalid JSON on line {len(rows) + 1}: {exc}") from exc
            if isinstance(obj, dict):
                rows.append(obj)
    return rows


# --------------------------------------------------------------------------- #
#  Validation / normalisation
# --------------------------------------------------------------------------- #
def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        items = [str(v) for v in value]
    else:
        text = str(value).strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                items = [str(v) for v in parsed] if isinstance(parsed, list) else [text]
            except json.JSONDecodeError:
                items = text.replace("|", ";").split(";")
        else:
            items = text.replace("|", ";").split(";")
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        entry = re.sub(r"\s+", " ", str(item)).strip(" .;-")
        if not entry:
            continue
        key = entry.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(entry)
    return cleaned


def _as_year(value: Any) -> int | None:
    if value in (None, "", "NA", "n/a", "null"):
        return None
    match = re.search(r"(1[89]\d{2}|20\d{2}|21\d{2})", str(value))
    return int(match.group(1)) if match else None


def _as_bool(value: Any, default: bool = True) -> bool:
    if value in (None, ""):
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "t"}


def _requirement_type(text: str) -> str:
    lowered = text.lower()
    for type_name, patterns in REQUIREMENT_TYPE_PATTERNS:
        if any(pattern in lowered for pattern in patterns):
            return type_name
    return "technical"


def validate_record(row: dict[str, Any], row_number: int) -> StandardRecord | None:
    """Map a raw row onto :class:`StandardRecord`, raising on invalid data."""
    mapped: dict[str, Any] = {}
    unknown: list[str] = []
    for key, value in row.items():
        canonical = _canonical_key(key)
        if canonical is None:
            if _normalise_key(key):
                unknown.append(str(key))
            continue
        mapped.setdefault(canonical, value)

    missing = [f for f in REQUIRED_FIELDS if not _as_text(mapped.get(f))]
    if missing:
        raise ValidationIssue(
            f"row {row_number}: missing required field(s): {', '.join(missing)}"
        )

    is_number = _as_text(mapped["is_number"]) or ""
    if not IS_NUMBER_RE.match(is_number):
        raise ValidationIssue(f"row {row_number}: invalid is_number '{is_number}'")
    title = _as_text(mapped["title"]) or ""
    if len(title) < 5:
        raise ValidationIssue(f"row {row_number}: title is too short ('{title}')")

    status = _as_text(mapped.get("status")) or "Active"
    status_match = next((s for s in VALID_STATUSES if s.lower() == status.lower()), None)
    if status_match is None:
        raise ValidationIssue(
            f"row {row_number}: invalid status '{status}'. Use one of {VALID_STATUSES}"
        )

    year = _as_year(mapped.get("year"))
    if year is not None and not (1900 <= year <= 2100):
        raise ValidationIssue(f"row {row_number}: year {year} is out of range")

    source = _as_text(mapped.get("source"))
    is_demo = _as_bool(mapped.get("is_demonstration"), default=True)
    if source is None and is_demo:
        source = (
            f"{DEMO_SOURCE_PREFIX} - placeholder metadata authored by the SIH26108 "
            "project team; not a verified BIS record"
        )

    if unknown:
        logger.debug("row %d: ignoring unmapped column(s): %s", row_number, ", ".join(unknown))

    return StandardRecord(
        is_number=is_number,
        title=title[:400],
        sector=(_as_text(mapped.get("sector")) or "General")[:120],
        category=(_as_text(mapped.get("category")) or "General")[:120],
        product=_as_text(mapped.get("product")),
        scope=_as_text(mapped.get("scope")),
        description=_as_text(mapped.get("description")),
        keywords=_as_list(mapped.get("keywords"))[:60],
        requirements=_as_list(mapped.get("requirements"))[:80],
        source=source,
        source_url=_as_text(mapped.get("source_url")),
        year=year,
        status=status_match or "Active",
        revision=_as_text(mapped.get("revision")),
        replacement_code=_as_text(mapped.get("replacement_code")),
        is_demonstration=is_demo,
    )


# --------------------------------------------------------------------------- #
#  Persistence
# --------------------------------------------------------------------------- #
def upsert_standard(session, record: StandardRecord, *, vector: list[float], model: str) -> tuple[str, int]:
    existing = session.query(Standard).filter(Standard.is_number == record.is_number).first()

    values: dict[str, Any] = {
        "title": record.title,
        "sector": record.sector,
        "category": record.category,
        "product": record.product,
        "scope": record.scope,
        "description": record.description,
        "keywords": "; ".join(record.keywords) if record.keywords else None,
        "requirements": "; ".join(record.requirements) if record.requirements else None,
        "source": record.source,
        "source_url": record.source_url,
        "year": record.year,
        "status": record.status,
        "revision": record.revision,
        "replacement_code": record.replacement_code,
        "is_demonstration": record.is_demonstration,
        "embedding": json.dumps(vector),
        "embedding_model": model,
        "embedding_dim": len(vector),
        "embedding_updated_at": dt.datetime.now(),
    }

    if existing is None:
        standard = Standard(is_number=record.is_number, **values)
        session.add(standard)
        session.flush()
        action = "created"
    else:
        for key, value in values.items():
            setattr(existing, key, value)
        standard = existing
        action = "updated"

    # Keywords -------------------------------------------------------------
    session.query(StandardKeyword).filter(StandardKeyword.standard_id == standard.id).delete()
    for keyword in record.keywords:
        session.add(StandardKeyword(standard_id=standard.id, keyword=keyword[:191]))

    # Requirements ---------------------------------------------------------
    session.query(StandardRequirement).filter(
        StandardRequirement.standard_id == standard.id
    ).delete()
    for index, text in enumerate(record.requirements, start=1):
        session.add(
            StandardRequirement(
                standard_id=standard.id,
                requirement_code=f"clause_{index}",
                requirement_text=text,
                requirement_type=_requirement_type(text),
                is_mandatory=True,
            )
        )
    session.flush()
    return action, standard.id


# --------------------------------------------------------------------------- #
#  CLI
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import Indian Standards metadata into MySQL and build the vector index.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--csv", type=Path, help="Path to a CSV file")
    source.add_argument("--file", type=Path, help="Path to a .json/.jsonl/.xlsx/.xls file")
    parser.add_argument("--sheet", help="Excel sheet name (default: first sheet)")
    parser.add_argument(
        "--upsert",
        action="store_true",
        default=True,
        help="Update existing records matched on is_number (default: on)",
    )
    parser.add_argument(
        "--insert-only", dest="upsert", action="store_false", help="Skip records that already exist"
    )
    parser.add_argument(
        "--no-embeddings", action="store_true", help="Skip embedding generation (fast import)"
    )
    parser.add_argument(
        "--no-index", action="store_true", help="Do not rebuild the vector index afterwards"
    )
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size")
    parser.add_argument(
        "--create-tables",
        action="store_true",
        help="Create any missing tables via SQLAlchemy metadata before importing "
        "(equivalent to importing database/sih26108.sql, but idempotent).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate only, write nothing")
    parser.add_argument(
        "--limit", type=int, help="Import only the first N valid records (handy for testing)"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Abort on the first invalid record instead of skipping it",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    setup_logging()
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    path: Path = args.csv or args.file
    if not path.is_file():
        logger.error("Source file not found: %s", path)
        return 2

    logger.info("=" * 78)
    logger.info("SIH26108 standards importer")
    logger.info("Source : %s", path)
    logger.info("Target : %s", settings.safe_database_target())
    logger.info("=" * 78)

    # -- 1. read ---------------------------------------------------------- #
    try:
        raw_rows = read_records(path, args.sheet)
    except ValidationIssue as exc:
        logger.error("Could not read %s: %s", path, exc)
        return 2
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected read error")
        logger.error("%s", exc)
        return 2
    logger.info("Read %d raw row(s)", len(raw_rows))
    if not raw_rows:
        logger.error("The source file contains no records.")
        return 2

    # -- 2. validate ------------------------------------------------------ #
    records: list[StandardRecord] = []
    errors: list[str] = []
    seen: dict[str, int] = {}
    for index, row in enumerate(raw_rows, start=2):  # row 1 is the header
        try:
            record = validate_record(row, index)
        except ValidationIssue as exc:
            message = str(exc)
            errors.append(message)
            if args.strict:
                logger.error("%s", message)
                return 2
            continue
        if record is None:
            continue
        if record.is_number in seen:
            logger.warning(
                "Duplicate is_number '%s' (rows %d and %d) - keeping the first",
                record.is_number,
                seen[record.is_number],
                index,
            )
            continue
        seen[record.is_number] = index
        records.append(record)

    if args.limit:
        records = records[: args.limit]

    logger.info("Validated %d record(s); %d rejected", len(records), len(errors))
    for message in errors[:10]:
        logger.warning("  %s", message)
    if len(errors) > 10:
        logger.warning("  ... and %d more validation issue(s)", len(errors) - 10)
    if not records:
        logger.error("No valid records to import.")
        return 2

    # -- dry run ---------------------------------------------------------- #
    if args.dry_run:
        logger.info("DRY RUN - no database writes. First 5 valid records:")
        for record in records[:5]:
            logger.info(
                "  %-22s | %-40s | %s",
                record.is_number,
                record.title[:40],
                f"{len(record.keywords)} keywords, {len(record.requirements)} requirements",
            )
        logger.info("DRY RUN complete - %d record(s) would be imported.", len(records))
        return 0

    # -- 3. database reachability ----------------------------------------- #
    ok, message, details = check_database()
    if not ok:
        logger.error("MySQL is not reachable: %s", message)
        logger.error("Start MySQL in XAMPP, then re-run. (target: %s)", settings.safe_database_target())
        return 3
    logger.info("MySQL reachable: %s", details.get("server_version", "unknown"))

    # -- 3b. optional schema creation ------------------------------------- #
    if args.create_tables:
        from app.database.base import Base
        from app.database.session import get_engine
        import app.models  # noqa: F401 - registers every model on Base.metadata

        Base.metadata.create_all(bind=get_engine())
        logger.info("Schema verified/created from SQLAlchemy metadata")

    # -- 4. embeddings + upsert ------------------------------------------- #
    model_name = embedding_service.model_name
    if not args.no_embeddings:
        logger.info("Embedding model: %s (dim=%d)", model_name, embedding_service.dim)

    created = updated = skipped = 0
    vectors: list[list[float]] = []

    with session_scope() as session:
        for offset in range(0, len(records), args.batch_size):
            chunk = records[offset : offset + args.batch_size]
            documents = [r.document() for r in chunk]
            if args.no_embeddings:
                chunk_vectors: list[list[float]] = [[] for _ in chunk]
            else:
                matrix = embedding_service.encode(documents)
                chunk_vectors = [[float(x) for x in row] for row in matrix]

            for record, vector in zip(chunk, chunk_vectors):
                existing = session.query(Standard.id).filter(
                    Standard.is_number == record.is_number
                ).first()
                if existing and not args.upsert:
                    skipped += 1
                    continue
                if not vector:
                    # Reuse the stored vector when embedding generation was skipped.
                    stored = session.query(Standard.embedding).filter(
                        Standard.is_number == record.is_number
                    ).scalar()
                    vector = json.loads(stored) if stored else []
                action, _standard_id = upsert_standard(session, record, vector=vector, model=model_name)
                vectors.extend([vector] if vector else [])
                if action == "created":
                    created += 1
                else:
                    updated += 1
            logger.info(
                "Processed %d/%d record(s) (created=%d updated=%d skipped=%d)",
                min(offset + args.batch_size, len(records)),
                len(records),
                created,
                updated,
                skipped,
            )
        total_in_db = session.query(Standard).count()  # noqa: SIH - SQLAlchemy count()
        logger.info("Standards table now holds %d record(s)", total_in_db)

    logger.info(
        "Import summary -> created: %d, updated: %d, skipped: %d, rejected: %d",
        created,
        updated,
        skipped,
        len(errors),
    )

    # -- 5. rebuild the vector index -------------------------------------- #
    if args.no_index:
        logger.info("Vector index rebuild skipped (--no-index).")
        return 0

    logger.info("Rebuilding the vector index ...")
    vector_store.invalidate()
    with session_scope() as session:
        result = vector_store.build_from_database(session, force=True)
    logger.info(
        "Vector index ready -> backend=%s size=%s (encoded on the fly: %s)",
        result.get("backend"),
        result.get("size"),
        result.get("encoded_on_the_fly"),
    )
    logger.info("Index file: %s", settings.vector_index_path)
    logger.info("Done. Start the API with: uvicorn app.main:app --reload --port 8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
