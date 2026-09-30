"""Saved standards (shortlist) persistence."""

from __future__ import annotations

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models import ProcurementQuery, SavedStandard, Standard
from app.schemas.history import SavedStandardCreate, SavedStandardItem, SavedStandardUpdate
from app.services.standards import _summary

logger = get_logger(__name__)


def _to_item(row: SavedStandard, specification: str | None) -> SavedStandardItem:
    return SavedStandardItem(
        id=row.id,
        standard_id=row.standard_id,
        query_id=row.query_id,
        notes=row.notes,
        tag=row.tag,
        saved_at=row.saved_at,
        standard=_summary(row.standard),
        query_specification=specification,
    )


def list_saved(
    session: Session,
    *,
    user_id: int | None = None,
    search: str | None = None,
    tag: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[SavedStandardItem], int]:
    clauses = []
    if user_id is not None:
        clauses.append(SavedStandard.user_id == user_id)
    else:
        clauses.append(SavedStandard.user_id.is_(None))
    if tag:
        clauses.append(SavedStandard.tag == tag)
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            or_(
                Standard.is_number.like(like),
                Standard.title.like(like),
                SavedStandard.notes.like(like),
            )
        )
    where = and_(*clauses) if clauses else True

    total = int(
        session.execute(
            select(func.count())
            .select_from(SavedStandard)
            .join(Standard, Standard.id == SavedStandard.standard_id)
            .where(where)
        ).scalar_one()
    )

    stmt = (
        select(SavedStandard, ProcurementQuery.specification)
        .join(Standard, Standard.id == SavedStandard.standard_id)
        .outerjoin(ProcurementQuery, ProcurementQuery.id == SavedStandard.query_id)
        .where(where)
        .order_by(SavedStandard.saved_at.desc(), SavedStandard.id.desc())
        .offset(max(0, (page - 1) * page_size))
        .limit(page_size)
    )
    rows = session.execute(stmt).all()
    return [_to_item(row, specification) for row, specification in rows], total


def get_saved(session: Session, saved_id: int, *, user_id: int | None = None) -> SavedStandardItem:
    row = session.get(SavedStandard, saved_id)
    if row is None or (user_id is not None and row.user_id not in (None, user_id)):
        raise NotFoundError(
            f"Saved standard {saved_id} was not found.", details={"saved_id": saved_id}
        )
    specification = None
    if row.query_id:
        specification = session.execute(
            select(ProcurementQuery.specification).where(ProcurementQuery.id == row.query_id)
        ).scalar_one_or_none()
    return _to_item(row, specification)


def save_standard(
    session: Session, payload: SavedStandardCreate, *, user_id: int | None = None
) -> SavedStandardItem:
    standard = session.get(Standard, payload.standard_id)
    if standard is None:
        raise NotFoundError(
            f"Standard with id {payload.standard_id} was not found in the knowledge base.",
            details={"standard_id": payload.standard_id},
        )
    if payload.query_id is not None and session.get(ProcurementQuery, payload.query_id) is None:
        raise ValidationError(
            f"query_id {payload.query_id} does not exist.",
            details={"query_id": payload.query_id},
        )

    existing = session.execute(
        select(SavedStandard).where(
            and_(
                SavedStandard.standard_id == payload.standard_id,
                SavedStandard.user_id == user_id if user_id is not None else SavedStandard.user_id.is_(None),
            )
        )
    ).scalars().first()

    if existing is not None:
        # Saving twice is idempotent: refresh the note/tag instead of erroring.
        if payload.notes is not None:
            existing.notes = payload.notes
        if payload.tag is not None:
            existing.tag = payload.tag
        if payload.query_id is not None:
            existing.query_id = payload.query_id
        session.flush()
        return _to_item(existing, None)

    row = SavedStandard(
        standard_id=payload.standard_id,
        query_id=payload.query_id,
        notes=payload.notes,
        tag=payload.tag,
    )
    if user_id is not None:
        row.user_id = user_id
    session.add(row)
    try:
        session.flush()
    except IntegrityError as exc:  # unique(user_id, standard_id) race
        session.rollback()
        raise ValidationError(
            "This standard is already in your shortlist.", details={"standard_id": payload.standard_id}
        ) from exc
    logger.info("Standard %s saved (shortlist #%s)", payload.standard_id, row.id)
    return _to_item(row, None)


def update_saved(
    session: Session, saved_id: int, payload: SavedStandardUpdate, *, user_id: int | None = None
) -> SavedStandardItem:
    row = session.get(SavedStandard, saved_id)
    if row is None or (user_id is not None and row.user_id not in (None, user_id)):
        raise NotFoundError(
            f"Saved standard {saved_id} was not found.", details={"saved_id": saved_id}
        )
    if payload.notes is not None:
        row.notes = payload.notes
    if payload.tag is not None:
        row.tag = payload.tag
    session.flush()
    return _to_item(row, None)


def delete_saved(session: Session, saved_id: int, *, user_id: int | None = None) -> None:
    row = session.get(SavedStandard, saved_id)
    if row is None or (user_id is not None and row.user_id not in (None, user_id)):
        raise NotFoundError(
            f"Saved standard {saved_id} was not found.", details={"saved_id": saved_id}
        )
    session.execute(delete(SavedStandard).where(SavedStandard.id == saved_id))
    session.flush()
    logger.info("Shortlist entry #%s removed", saved_id)


def saved_ids(session: Session, *, user_id: int | None = None) -> set[int]:
    stmt = select(SavedStandard.standard_id).where(
        SavedStandard.user_id == user_id if user_id is not None else SavedStandard.user_id.is_(None)
    )
    return {int(value) for value in session.execute(stmt).scalars().all()}


def saved_tags(session: Session, *, user_id: int | None = None) -> list[str]:
    stmt = select(SavedStandard.tag).distinct().where(
        SavedStandard.tag.is_not(None),
        SavedStandard.user_id == user_id if user_id is not None else SavedStandard.user_id.is_(None),
    )
    return sorted({str(value) for value in session.execute(stmt).scalars().all() if value})


def load_saved_with_standards(session: Session, standard_ids: list[int]) -> list[Standard]:
    if not standard_ids:
        return []
    return list(
        session.execute(select(Standard).where(Standard.id.in_(standard_ids))).scalars().all()
    )
