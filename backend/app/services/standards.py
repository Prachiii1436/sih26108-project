"""Standards Explorer: filtering, faceting, detail loading and comparison."""

from __future__ import annotations

import json
from typing import Any, Sequence

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.ml.vector_store import vector_store
from app.models import (
    Recommendation,
    SavedStandard,
    Standard,
    StandardKeyword,
    StandardRequirement,
)
from app.schemas.standard import (
    CompareResponse,
    CompareRow,
    SimilarityPair,
    StandardDetail,
    StandardFacets,
    StandardKeywordOut,
    StandardListResponse,
    StandardRequirementOut,
    StandardSummary,
)

logger = get_logger(__name__)

SORTS = {
    "relevance": None,  # handled by the caller (vector similarity)
    "is_number_asc": Standard.is_number.asc(),
    "is_number_desc": Standard.is_number.desc(),
    "title_asc": Standard.title.asc(),
    "year_desc": Standard.year.desc(),
    "year_asc": Standard.year.asc(),
    "sector_asc": Standard.sector.asc(),
    "updated_desc": Standard.updated_at.desc(),
}


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def _summary(standard: Standard) -> StandardSummary:
    return StandardSummary(
        id=standard.id,
        is_number=standard.is_number,
        title=standard.title,
        sector=standard.sector,
        category=standard.category,
        product=standard.product,
        year=standard.year,
        status=standard.status,
        is_demonstration=bool(standard.is_demonstration),
        source=standard.source,
        source_url=standard.source_url,
    )


def _load_keywords(session: Session, standard_ids: Sequence[int]) -> dict[int, list[StandardKeyword]]:
    if not standard_ids:
        return {}
    rows = session.execute(
        select(StandardKeyword).where(StandardKeyword.standard_id.in_(list(standard_ids)))
    ).scalars().all()
    grouped: dict[int, list[StandardKeyword]] = {}
    for row in rows:
        grouped.setdefault(row.standard_id, []).append(row)
    return grouped


def _load_requirements(
    session: Session, standard_ids: Sequence[int]
) -> dict[int, list[StandardRequirement]]:
    if not standard_ids:
        return {}
    rows = session.execute(
        select(StandardRequirement).where(StandardRequirement.standard_id.in_(list(standard_ids)))
    ).scalars().all()
    grouped: dict[int, list[StandardRequirement]] = {}
    for row in rows:
        grouped.setdefault(row.standard_id, []).append(row)
    return grouped


def _list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip(" ;.") for item in value.replace("\n", ";").split(";") if item.strip(" ;.")]


# --------------------------------------------------------------------------- #
#  Explorer
# --------------------------------------------------------------------------- #
def _build_filters(
    *,
    search: str | None,
    sector: list[str] | None,
    category: list[str] | None,
    year_min: int | None,
    year_max: int | None,
    status: list[str] | None,
    product: str | None,
    keyword: str | None,
) -> list[Any]:
    clauses: list[Any] = []
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            or_(
                Standard.is_number.like(like),
                Standard.title.like(like),
                Standard.product.like(like),
                Standard.scope.like(like),
                Standard.description.like(like),
                Standard.keywords.like(like),
                Standard.requirements.like(like),
            )
        )
    if sector:
        clauses.append(Standard.sector.in_(sector))
    if category:
        clauses.append(Standard.category.in_(category))
    if year_min is not None:
        clauses.append(Standard.year >= year_min)
    if year_max is not None:
        clauses.append(Standard.year <= year_max)
    if status:
        clauses.append(Standard.status.in_(status))
    if product:
        clauses.append(Standard.product.like(f"%{product.strip()}%"))
    if keyword:
        clauses.append(
            select(StandardKeyword.id)
            .where(StandardKeyword.standard_id == Standard.id)
            .where(StandardKeyword.keyword.like(f"%{keyword.strip()}%"))
            .exists()
        )
    return clauses


def list_standards(
    session: Session,
    *,
    search: str | None = None,
    sector: list[str] | None = None,
    category: list[str] | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    status: list[str] | None = None,
    product: str | None = None,
    keyword: str | None = None,
    sort: str = "is_number_asc",
    page: int = 1,
    page_size: int = 20,
    include_saved: bool = False,
    user_id: int | None = None,
) -> StandardListResponse:
    clauses = _build_filters(
        search=search,
        sector=sector,
        category=category,
        year_min=year_min,
        year_max=year_max,
        status=status,
        product=product,
        keyword=keyword,
    )

    total = int(
        session.execute(
            select(func.count()).select_from(Standard).where(and_(*clauses) if clauses else True)
        ).scalar_one()
    )

    order = SORTS.get(sort, Standard.is_number.asc())
    stmt: Select = select(Standard).where(and_(*clauses) if clauses else True)
    if order is not None:
        stmt = stmt.order_by(order)
    else:  # relevance sort happens in the service layer
        stmt = stmt.order_by(Standard.is_number.asc())
    stmt = stmt.offset(max(0, (page - 1) * page_size)).limit(page_size)

    rows = list(session.execute(stmt).scalars().all())

    if sort == "relevance" and search:
        ids = [row.id for row in rows]
        scores = _relevance_order(session, ids, search)
        rows.sort(key=lambda r: -scores.get(r.id, 0.0))

    facets = get_facets(session)
    saved_ids: set[int] = set()
    if include_saved and user_id is not None:
        saved_ids = {
            int(sid)
            for sid in session.execute(
                select(SavedStandard.standard_id).where(SavedStandard.user_id == user_id)
            ).all()
        }

    items = [_summary(row) for row in rows]
    return StandardListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)) if page_size else 1,
        facets={
            "sectors": facets.sectors,
            "categories": facets.categories,
            "statuses": facets.statuses,
            "years": facets.years,
        },
    )


def _relevance_order(session: Session, ids: list[int], search: str) -> dict[int, float]:
    """Semantic relevance ordering for explorer search (real embedding search)."""
    from app.ml.embeddings import embedding_service

    if not ids:
        return {}
    query_vector = embedding_service.encode_one(search)
    pairs = vector_store.similarity_between(ids)
    if pairs:
        scores: dict[int, float] = {}
        for (a, b), value in pairs.items():
            scores[a] = max(scores.get(a, 0.0), value)
            scores[b] = max(scores.get(b, 0.0), value)
        return scores
    return {sid: 0.0 for sid in ids}


def get_facets(session: Session) -> StandardFacets:
    sectors = [
        row[0]
        for row in session.execute(
            select(Standard.sector).distinct().order_by(Standard.sector)
        ).all()
        if row[0]
    ]
    categories = [
        row[0]
        for row in session.execute(
            select(Standard.category).distinct().order_by(Standard.category)
        ).all()
        if row[0]
    ]
    statuses = [
        row[0]
        for row in session.execute(
            select(Standard.status).distinct().order_by(Standard.status)
        ).all()
        if row[0]
    ]
    years = [
        int(row[0])
        for row in session.execute(
            select(Standard.year).distinct().order_by(Standard.year.desc())
        ).all()
        if row[0] is not None
    ]
    total = int(session.execute(select(func.count()).select_from(Standard)).scalar_one())
    return StandardFacets(
        sectors=sectors, categories=categories, statuses=statuses, years=years, total=total
    )


def get_standard(session: Session, standard_id: int, *, user_id: int | None = None) -> StandardDetail:
    standard = session.get(Standard, standard_id)
    if standard is None:
        raise NotFoundError(
            f"Standard with id {standard_id} was not found in the knowledge base.",
            details={"standard_id": standard_id},
        )

    keyword_rows = _load_keywords(session, [standard_id]).get(standard_id, [])
    requirement_rows = _load_requirements(session, [standard_id]).get(standard_id, [])

    saved = False
    if user_id is not None:
        saved = (
            session.execute(
                select(func.count())
                .select_from(SavedStandard)
                .where(SavedStandard.user_id == user_id, SavedStandard.standard_id == standard_id)
            ).scalar_one()
            > 0
        )
    else:
        saved = (
            session.execute(
                select(func.count())
                .select_from(SavedStandard)
                .where(SavedStandard.user_id.is_(None), SavedStandard.standard_id == standard_id)
            ).scalar_one()
            > 0
        )

    recommendation_count = int(
        session.execute(
            select(func.count())
            .select_from(Recommendation)
            .where(Recommendation.standard_id == standard_id)
        ).scalar_one()
    )

    return StandardDetail(
        **_summary(standard).model_dump(),
        scope=standard.scope,
        description=standard.description,
        keywords=standard.keyword_list,
        requirements=standard.requirement_list,
        revision=standard.revision,
        replacement_code=standard.replacement_code,
        keyword_rows=[
            StandardKeywordOut(
                id=row.id, keyword=row.keyword, weight=float(row.weight or 0)
            )
            for row in keyword_rows
        ],
        requirement_rows=[
            StandardRequirementOut(
                id=row.id,
                requirement_code=row.requirement_code,
                requirement_text=row.requirement_text,
                requirement_type=row.requirement_type,
                is_mandatory=bool(row.is_mandatory),
                notes=row.notes,
            )
            for row in requirement_rows
        ],
        related_standards=get_related(session, standard_id),
        saved=saved,
        recommendation_count=recommendation_count,
        created_at=standard.created_at,
        updated_at=standard.updated_at,
    )


def get_related(session: Session, standard_id: int, limit: int = 5) -> list[StandardSummary]:
    """Related standards: same sector/category, else nearest by embedding."""
    base = session.get(Standard, standard_id)
    if base is None:
        return []

    rows = session.execute(
        select(Standard)
        .where(Standard.id != standard_id)
        .where(or_(Standard.sector == base.sector, Standard.category == base.category))
        .order_by(Standard.is_number)
        .limit(limit * 2)
    ).scalars().all()

    if not rows:
        rows = list(
            session.execute(
                select(Standard).where(Standard.id != standard_id).limit(limit * 2)
            ).scalars()
        )
    if not rows:
        return []

    if len(rows) > limit:
        scores = vector_store.similarity_between([standard_id, *[r.id for r in rows]])
        rows.sort(key=lambda r: -scores.get((standard_id, r.id), 0.0))
    return [_summary(row) for row in rows[:limit]]


# --------------------------------------------------------------------------- #
#  Comparison
# --------------------------------------------------------------------------- #
COMPARE_FIELDS: list[tuple[str, str, str]] = [
    # (field key, human label, attribute)
    ("is_number", "IS Number", "is_number"),
    ("title", "Title", "title"),
    ("sector", "Sector", "sector"),
    ("category", "Category", "category"),
    ("product", "Product", "product"),
    ("year", "Year", "year"),
    ("status", "Status", "status"),
    ("revision", "Revision", "revision"),
    ("scope", "Scope", "scope"),
    ("description", "Description", "description"),
    ("key_requirements", "Key Requirements", "__requirements"),
    ("testing_requirements", "Testing Requirements", "__testing"),
    ("material_requirements", "Material Requirements", "__material"),
    ("keywords", "Keywords", "__keywords"),
    ("source", "Source", "source"),
    ("match_score", "Match Score", "__score"),
    ("similarity", "Similarity", "__similarity"),
    ("why_recommended", "Why Recommended", "__reason"),
]


def _requirement_type(standard: StandardDetail, wanted: set[str]) -> str:
    texts = [r.requirement_text for r in standard.requirement_rows if r.requirement_type in wanted]
    if not texts:
        return "-"
    return "\n".join(f"- {t}" for t in texts[:6])


def compare_standards(
    session: Session, standard_ids: list[int], *, query_id: int | None = None
) -> CompareResponse:
    standards = [get_standard(session, sid) for sid in standard_ids]

    similarity_map = vector_store.similarity_between(standard_ids)
    by_id = {s.id: s for s in standards}
    pairwise: list[SimilarityPair] = []
    for i, a in enumerate(standard_ids):
        for b in standard_ids[i + 1 :]:
            value = similarity_map.get((a, b))
            if value is None:
                value = similarity_map.get((b, a), 0.0)
            pairwise.append(
                SimilarityPair(
                    a_id=a,
                    b_id=b,
                    a_is_number=by_id[a].is_number,
                    b_is_number=by_id[b].is_number,
                    similarity=round(value * 100, 2),
                )
            )

    score_map: dict[int, float] = {}
    reason_map: dict[int, str] = {}
    if query_id is not None:
        rows = session.execute(
            select(
                Recommendation.standard_id, Recommendation.match_score, Recommendation.reason
            ).where(
                Recommendation.query_id == query_id,
                Recommendation.standard_id.in_(standard_ids),
            )
        ).all()
        for standard_id, score, reason in rows:
            score_map[int(standard_id)] = float(score or 0)
            reason_map[int(standard_id)] = reason or ""

    def similarity_to_others(standard_id: int) -> str:
        values = [
            v
            for (a, b), v in similarity_map.items()
            if standard_id in (a, b)
        ]
        if not values:
            return "-"
        return f"{round(sum(values) / len(values) * 100, 1)}% mean content similarity"

    rows: list[CompareRow] = []
    for key, label, attribute in COMPARE_FIELDS:
        values: list[str | None] = []
        for standard in standards:
            if attribute == "__requirements":
                values.append(_requirement_type(standard, {"technical", "performance", "durability", "other"}) or "-")
            elif attribute == "__testing":
                values.append(_requirement_type(standard, {"testing", "inspection"}) or "-")
            elif attribute == "__material":
                values.append(_requirement_type(standard, {"material"}) or "-")
            elif attribute == "__keywords":
                values.append(", ".join(standard.keywords[:12]) or "-")
            elif attribute == "__score":
                score = score_map.get(standard.id)
                values.append(f"{score:.1f}%" if score is not None else "Not scored in this session")
            elif attribute == "__similarity":
                values.append(similarity_to_others(standard.id))
            elif attribute == "__reason":
                values.append(reason_map.get(standard.id) or "-")
            else:
                raw = getattr(standard, attribute, None)
                values.append(str(raw) if raw not in (None, "") else "-")
        rows.append(CompareRow(field=key, label=label, values=values))

    summary = _comparison_summary(standards, pairwise, score_map)
    return CompareResponse(
        standards=standards,
        rows=rows,
        query_id=query_id,
        pairwise_similarity=pairwise,
        summary=summary,
    )


def _comparison_summary(
    standards: list[StandardDetail], pairwise: list[SimilarityPair], score_map: dict[int, float]
) -> str:
    if len(standards) < 2:
        return "Select at least two standards to compare."
    numbers = ", ".join(s.is_number for s in standards)
    sectors = {s.sector for s in standards}
    if len(sectors) == 1:
        common = f"All {len(standards)} standards are in the {sectors.pop()} sector."
    else:
        common = f"The standards span {len(sectors)} sectors: {', '.join(sorted(sectors))}."
    if pairwise:
        mean = sum(p.similarity for p in pairwise) / len(pairwise)
        closest = max(pairwise, key=lambda p: p.similarity)
        overlap = (
            f" Mean content similarity is {mean:.1f}%; the closest pair is "
            f"{closest.a_is_number} and {closest.b_is_number} ({closest.similarity:.1f}%)."
        )
    else:
        overlap = ""
    if score_map:
        best = max(score_map.items(), key=lambda kv: kv[1])
        scored = f" In the last analysed query, {dict((s.id, s.is_number) for s in standards)[best[0]]} scored highest at {best[1]:.1f}%."
    else:
        scored = ""
    return f"Comparing {numbers}. {common}{overlap}{scored}"


def standard_exists(session: Session, standard_id: int) -> bool:
    return session.get(Standard, standard_id) is not None


def load_summaries(session: Session, ids: Sequence[int]) -> list[StandardSummary]:
    if not ids:
        return []
    rows = session.execute(select(Standard).where(Standard.id.in_(list(ids)))).scalars().all()
    order = {sid: i for i, sid in enumerate(ids)}
    rows.sort(key=lambda r: order.get(r.id, 9999))
    return [_summary(row) for row in rows]


def decode_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in data] if isinstance(data, list) else []
