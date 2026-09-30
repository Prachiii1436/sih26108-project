"""The recommendation engine (Steps 5-8 of the pipeline).

Scoring model
-------------
Six independent factors, each normalised to ``0-100``, combined with the weights
from ``RECOMMENDATION_WEIGHTS`` (see ``backend/.env``):

======================  =========================================================
factor                  how it is computed
======================  =========================================================
semantic_similarity     cosine similarity of the sentence-transformer embedding
                        of the query document vs. the standard document
keyword_similarity      overlap of extracted query keywords with the standard's
                        keywords (Jaccard x coverage, sqrt-blended)
product_similarity      token/embedding match between the detected product and
                        the standard's product + title + category
sector_similarity       exact/partial sector match (detected vs. standard)
requirement_similarity  best-clause alignment: each query requirement is matched
                        against the standard's clause requirements
application_similarity  token match of the detected application against the
                        standard's scope/description/keywords
======================  =========================================================

The final score is a **recommendation relevance score produced by this
application**. It is not a BIS compliance, certification or conformance score.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.embeddings import (
    compose_query_document,
    compose_standard_document,
    embedding_service,
    normalize_space,
    term_overlap_score,
    tokenize,
)
from app.ml.vector_store import vector_store
from app.models import Standard, StandardRequirement
from app.schemas.analysis import ExtractedRequirements, MatchEvidence, MatchFactor
from app.schemas.common import PipelineStage

logger = get_logger(__name__)

FACTOR_LABELS: dict[str, str] = {
    "semantic": "Semantic similarity",
    "keyword": "Keyword similarity",
    "product": "Product similarity",
    "sector": "Sector similarity",
    "requirement": "Requirement similarity",
    "application": "Application similarity",
}

NO_MATCH_MESSAGE = (
    "No sufficiently relevant standard was found in the current knowledge base. "
    "Try adding more technical details (material, application, performance or safety "
    "requirements) or browse the Standards Explorer directly."
)


# --------------------------------------------------------------------------- #
#  Internal candidate representation
# --------------------------------------------------------------------------- #
@dataclass(slots=True)
class StandardDocument:
    """Pre-computed text blobs for one standard (avoids repeated assembly)."""

    id: int
    is_number: str
    title: str
    sector: str
    category: str
    product: str | None
    scope: str | None
    description: str | None
    keywords: list[str]
    requirements: list[str]
    clauses: list[str]
    year: int | None
    status: str
    is_demonstration: bool
    source: str | None
    source_url: str | None
    document: str
    keyword_tokens: set[str] = field(default_factory=set)
    product_tokens: set[str] = field(default_factory=set)
    application_tokens: set[str] = field(default_factory=set)
    requirement_tokens: set[set[str]] = field(default_factory=list)


@dataclass(slots=True)
class ScoredStandard:
    standard: StandardDocument
    semantic: float
    keyword: float
    product: float
    sector: float
    requirement: float
    application: float
    final: float
    matched_keywords: list[str]
    matched_requirements: list[str]
    strengths: list[str]
    gaps: list[str]


def _split_requirements(raw: str | None) -> list[str]:
    if not raw:
        return []
    import re

    parts = [p.strip(" .") for p in re.split(r"[;\n]", raw) if p.strip(" .")]
    return parts


def load_standard_documents(
    session: Session, standard_ids: list[int] | None = None
) -> dict[int, StandardDocument]:
    """Build the in-memory document cache for scoring."""
    stmt = select(
        Standard.id,
        Standard.is_number,
        Standard.title,
        Standard.sector,
        Standard.category,
        Standard.product,
        Standard.scope,
        Standard.description,
        Standard.keywords,
        Standard.requirements,
        Standard.year,
        Standard.status,
        Standard.is_demonstration,
        Standard.source,
        Standard.source_url,
    )
    if standard_ids:
        stmt = stmt.where(Standard.id.in_(standard_ids))
    rows = session.execute(stmt).all()

    clause_rows = session.execute(
        select(StandardRequirement.standard_id, StandardRequirement.requirement_text)
    ).all()
    clauses_by_standard: dict[int, list[str]] = {}
    for standard_id, text in clause_rows:
        if standard_ids and standard_id not in set(standard_ids):
            continue
        clauses_by_standard.setdefault(int(standard_id), []).append(text)

    documents: dict[int, StandardDocument] = {}
    for row in rows:
        keywords = [k for k in (row.keywords or "").replace("|", ";").split(";") if k.strip()]
        keywords = [k.strip() for k in keywords]
        requirements = _split_requirements(row.requirements)
        clauses = clauses_by_standard.get(int(row.id), []) or requirements
        document = compose_standard_document(
            title=row.title,
            sector=row.sector,
            category=row.category,
            product=row.product,
            scope=row.scope,
            description=row.description,
            keywords=keywords,
            requirements=requirements,
        )
        application_text = " ".join(filter(None, [row.scope, row.description, " ".join(keywords)]))
        doc = StandardDocument(
            id=int(row.id),
            is_number=row.is_number,
            title=row.title,
            sector=row.sector or "",
            category=row.category or "",
            product=row.product,
            scope=row.scope,
            description=row.description,
            keywords=keywords,
            requirements=requirements,
            clauses=clauses,
            year=row.year,
            status=row.status,
            is_demonstration=bool(row.is_demonstration),
            source=row.source,
            source_url=row.source_url,
            document=document,
            keyword_tokens=set(tokenize(" ".join(keywords))),
            product_tokens=set(tokenize(f"{row.product or ''} {row.title} {row.category or ''}")),
            application_tokens=set(tokenize(application_text)),
            requirement_tokens=[set(tokenize(c)) for c in clauses],
        )
        documents[doc.id] = doc
    return documents


# --------------------------------------------------------------------------- #
#  Factor scorers
# --------------------------------------------------------------------------- #
def _pct(value: float) -> float:
    return round(max(0.0, min(1.0, value)) * 100.0, 2)


def score_keyword_factor(
    doc: StandardDocument, query_keywords: set[str], query_text: str
) -> tuple[float, list[str]]:
    if not doc.keyword_tokens:
        return 0.0, []
    if not query_keywords:
        return 0.0, []
    intersection = query_keywords & doc.keyword_tokens
    if not intersection:
        # Fall back to whole-text overlap so a record without keywords is not
        # unfairly penalised.
        overlap, matched = term_overlap_score(query_text, " ".join(doc.keywords))
        return _pct(overlap), matched
    union = len(query_keywords | doc.keyword_tokens)
    jaccard = len(intersection) / union if union else 0.0
    coverage = len(intersection) / len(query_keywords)
    score = (jaccard**0.5) * (coverage**0.5)
    return _pct(score), sorted(intersection)[:12]


def score_product_factor(
    doc: StandardDocument, product: str | None, doc_vector
) -> float:
    if not product:
        return 0.0
    product_tokens = set(tokenize(product))
    if not product_tokens:
        return 0.0
    if product_tokens & doc.product_tokens:
        overlap = len(product_tokens & doc.product_tokens) / len(product_tokens)
        if doc.product and product.lower() in doc.product.lower():
            return 100.0
        return _pct(0.6 + 0.4 * overlap)
    # No literal overlap - fall back to embedding similarity of just the product.
    product_vector = embedding_service.encode_one(product)
    return _pct(max(0.0, embedding_service.cosine(product_vector, doc_vector)))


def score_sector_factor(detected: str | None, doc: StandardDocument) -> float:
    if not detected:
        return 0.0
    d = detected.strip().lower()
    if d == (doc.sector or "").strip().lower():
        return 100.0
    if d in (doc.sector or "").lower() or (doc.sector or "").lower() in d:
        return 80.0
    d_tokens = set(tokenize(detected))
    s_tokens = set(tokenize(doc.sector)) | set(tokenize(doc.category))
    if d_tokens & s_tokens:
        return _pct(len(d_tokens & s_tokens) / len(d_tokens | s_tokens) + 0.3)
    return 0.0


def score_requirement_factor(
    doc: StandardDocument, requirements: list[str]
) -> tuple[float, list[str]]:
    """Best-clause alignment between query requirements and standard clauses."""
    if not requirements or not doc.clauses:
        return 0.0, []
    matched: list[str] = []
    total = 0.0
    for requirement in requirements:
        req_tokens = set(tokenize(requirement))
        if not req_tokens:
            continue
        best = 0.0
        best_clause = ""
        for clause, clause_tokens in zip(doc.clauses, doc.requirement_tokens):
            if not clause_tokens:
                continue
            union = req_tokens | clause_tokens
            jaccard = len(req_tokens & clause_tokens) / len(union) if union else 0.0
            coverage = len(req_tokens & clause_tokens) / len(req_tokens)
            score = (jaccard * coverage) ** 0.5
            if score > best:
                best, best_clause = score, clause
        if best > 0.12:
            matched.append(best_clause)
        total += best
    average = total / len(requirements)
    return _pct(average), matched[:6]


def score_application_factor(
    doc: StandardDocument, application: str | None
) -> float:
    if not application:
        return 0.0
    app_tokens = set(tokenize(application))
    if not app_tokens:
        return 0.0
    if app_tokens & doc.application_tokens:
        coverage = len(app_tokens & doc.application_tokens) / len(app_tokens)
        return _pct(min(1.0, coverage + 0.25))
    return 0.0


# --------------------------------------------------------------------------- #
#  Explanations
# --------------------------------------------------------------------------- #
def _level(score: float) -> str:
    if score >= 75:
        return "High"
    if score >= 45:
        return "Moderate"
    if score >= 20:
        return "Low"
    return "Negligible"


def build_explanation(
    doc: StandardDocument,
    factors: dict[str, float],
    evidence: MatchEvidence,
    extraction: ExtractedRequirements,
) -> str:
    """Compose the plain-language "why was this recommended?" text."""
    parts: list[str] = []

    drivers = sorted(
        ((k, v) for k, v in factors.items() if k != "final"),
        key=lambda kv: -kv[1],
    )
    top_names = [FACTOR_LABELS[k] for k, v in drivers[:2] if v >= 30]

    subject = f"{doc.is_number} ({doc.title})"
    if factors.get("product", 0) >= 55:
        product = extraction.product or "the detected product"
        parts.append(
            f"{subject} is a strong candidate because its product coverage aligns with "
            f"{product}."
        )
    elif factors.get("semantic", 0) >= 45:
        parts.append(
            f"{subject} is a strong candidate because the procurement specification is "
            f"semantically close to the scope described in this standard."
        )
    else:
        parts.append(
            f"{subject} appears potentially relevant based on partial overlap with the "
            f"procurement specification."
        )

    supporting: list[str] = []
    if factors.get("requirement", 0) >= 35 and evidence.matched_requirements:
        supporting.append(
            f"{len(evidence.matched_requirements)} requirement clause(s) of this standard "
            f"match the extracted requirements"
        )
    if factors.get("sector", 0) >= 70 and extraction.sector:
        supporting.append(f"it belongs to the same sector ({doc.sector})")
    if factors.get("application", 0) >= 45 and extraction.application:
        supporting.append(f"the stated application ({extraction.application}) is within scope")
    if factors.get("keyword", 0) >= 30 and evidence.matched_keywords:
        supporting.append(
            f"{len(evidence.matched_keywords)} keyword(s) overlap: "
            f"{', '.join(evidence.matched_keywords[:4])}"
        )

    if supporting:
        parts.append("This is supported by " + "; ".join(supporting) + ".")

    if top_names:
        parts.append(
            f"Weighting: {', '.join(top_names)} contributed most to the ranking "
            f"(application relevance score {factors.get('final', 0):.0f}%)."
        )

    if evidence.gaps:
        parts.append(
            "Verify manually: " + "; ".join(evidence.gaps[:2]) + "."
        )

    return " ".join(parts)


def _strengths_and_gaps(
    factors: dict[str, float], evidence: MatchEvidence
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    gaps: list[str] = []
    for key, label in FACTOR_LABELS.items():
        value = factors.get(key, 0.0)
        if value >= 65:
            strengths.append(f"{label}: {_level(value)}")
        elif 0 < value < 25:
            gaps.append(f"{label} is weak ({value:.0f}%)")
    if evidence.matched_requirements:
        strengths.append(f"{len(evidence.matched_requirements)} matched requirement clause(s)")
    if not evidence.matched_requirements:
        gaps.append("no requirement clause of this standard matched verbatim - review scope manually")
    return strengths[:5], gaps[:4]


# --------------------------------------------------------------------------- #
#  Engine
# --------------------------------------------------------------------------- #
class RecommendationEngine:
    """Orchestrates semantic retrieval + multi-factor scoring + explanation."""

    def __init__(self) -> None:
        self.weights = dict(settings.weights)

    # -- main entry point ------------------------------------------------ #
    def recommend(
        self,
        session: Session,
        extraction: ExtractedRequirements,
        specification: str,
        *,
        top_k: int | None = None,
        pool_size: int | None = None,
    ) -> tuple[list[ScoredStandard], list[PipelineStage], int]:
        limit = min(top_k or settings.default_top_k, settings.max_top_k)
        pool = pool_size or settings.candidate_pool
        stages: list[PipelineStage] = []

        # --- Step 4/5: embeddings + semantic search --------------------- #
        t0 = time.perf_counter()
        query_document = compose_query_document(
            specification=specification,
            product=extraction.product,
            material=extraction.material,
            application=extraction.application,
            sector=extraction.sector,
            requirements=extraction.requirements,
            keywords=extraction.keywords,
        )
        query_vector = embedding_service.encode_one(query_document)
        semantic_ms = (time.perf_counter() - t0) * 1000
        stages.append(
            PipelineStage(
                key="embedding",
                label="Generating sentence embeddings",
                status="completed",
                detail=f"{embedding_service.model_name} - dim {embedding_service.dim}",
                duration_ms=round(semantic_ms, 2),
            )
        )

        t0 = time.perf_counter()
        vector_store.ensure_ready(session)
        search_k = max(pool, limit * settings.semantic_candidate_multiplier)
        hits = vector_store.search(query_vector, top_k=search_k)
        semantic_map: dict[int, float] = {
            hit.standard_id: max(0.0, min(1.0, hit.score)) for hit in hits
        }
        candidate_ids = list(dict.fromkeys([hit.standard_id for hit in hits]))
        search_detail = (
            f"{vector_store.backend} vector index - {len(hits)} candidate(s) "
            f"out of {vector_store.size} standards"
        )
        search_ms = (time.perf_counter() - t0) * 1000

        if not candidate_ids:
            # Index empty/not built - degrade to scanning the whole knowledge base
            # with the same scoring model so the API still answers correctly.
            candidate_ids = [
                int(row[0]) for row in session.execute(select(Standard.id).limit(pool)).all()
            ]
            search_detail = (
                f"vector index unavailable - full scan of {len(candidate_ids)} standards"
            )
        stages.append(
            PipelineStage(
                key="search",
                label="Searching the standards knowledge base",
                status="completed",
                detail=search_detail,
                duration_ms=round(search_ms, 2),
            )
        )

        if not candidate_ids:
            return [], stages, 0

        # --- Step 6: multi-factor scoring ------------------------------- #
        t0 = time.perf_counter()
        documents = load_standard_documents(session, candidate_ids)
        query_keywords = {k.lower() for k in extraction.keywords}
        query_text = " ".join([specification, extraction.product or "", extraction.material or ""])
        doc_vectors = _encode_documents(documents)

        scored: list[ScoredStandard] = []
        for doc in documents.values():
            doc_vector = doc_vectors.get(doc.id)
            if doc_vector is None:
                doc_vector = embedding_service.encode_one(doc.document)

            semantic = _pct(semantic_map.get(doc.id, 0.0))
            keyword, matched_keywords = score_keyword_factor(doc, query_keywords, query_text)
            product = score_product_factor(doc, extraction.product, doc_vector)
            sector = score_sector_factor(extraction.sector, doc)
            requirement, matched_requirements = score_requirement_factor(doc, extraction.requirements)
            application = score_application_factor(doc, extraction.application)

            factors = {
                "semantic": semantic,
                "keyword": keyword,
                "product": product,
                "sector": sector,
                "requirement": requirement,
                "application": application,
            }
            final = round(
                sum(factors[name] * weight for name, weight in self.weights.items()), 2
            )
            if doc.status != "Active":
                # Never drop withdrawn/superseded information - just mark it.
                final = round(final * 0.9, 2)
            final = round(max(0.0, min(100.0, final)), 2)

            evidence = MatchEvidence(
                matched_requirements=matched_requirements,
                matched_keywords=matched_keywords,
            )
            strengths, gaps = _strengths_and_gaps(factors, evidence)
            evidence.strengths = strengths
            evidence.gaps = gaps

            scored.append(
                ScoredStandard(
                    standard=doc,
                    semantic=semantic,
                    keyword=keyword,
                    product=product,
                    sector=sector,
                    requirement=requirement,
                    application=application,
                    final=final,
                    matched_keywords=matched_keywords,
                    matched_requirements=matched_requirements,
                    strengths=strengths,
                    gaps=gaps,
                )
            )

        # --- Step 7: rank ----------------------------------------------- #
        scored.sort(key=lambda s: (-s.final, s.standard.is_number))
        ranking_ms = (time.perf_counter() - t0) * 1000
        stages.append(
            PipelineStage(
                key="scoring",
                label="Calculating multi-factor relevance",
                status="completed",
                detail="weights: "
                + ", ".join(f"{k}={v:.2f}" for k, v in self.weights.items()),
                duration_ms=round(ranking_ms, 2),
            )
        )

        threshold = settings.min_relevance
        selected = [s for s in scored if s.final >= threshold][:limit]
        stages.append(
            PipelineStage(
                key="recommendations",
                label="Generating ranked recommendations",
                status="completed",
                detail=(
                    f"{len(selected)} standard(s) above the {threshold:.0f}% relevance "
                    f"threshold (from {len(scored)} scored candidates)"
                ),
                duration_ms=0.0,
            )
        )
        return selected, stages, len(scored)

    # -- helpers --------------------------------------------------------- #
    def explain(self, item: ScoredStandard, extraction: ExtractedRequirements) -> str:
        factors = {
            "semantic": item.semantic,
            "keyword": item.keyword,
            "product": item.product,
            "sector": item.sector,
            "requirement": item.requirement,
            "application": item.application,
            "final": item.final,
        }
        evidence = MatchEvidence(
            matched_requirements=item.matched_requirements,
            matched_keywords=item.matched_keywords,
            strengths=item.strengths,
            gaps=item.gaps,
        )
        return build_explanation(item.standard, factors, evidence, extraction)

    def factor_objects(self, item: ScoredStandard) -> list[MatchFactor]:
        values = {
            "semantic": item.semantic,
            "keyword": item.keyword,
            "product": item.product,
            "sector": item.sector,
            "requirement": item.requirement,
            "application": item.application,
        }
        factors: list[MatchFactor] = []
        for key, label in FACTOR_LABELS.items():
            weight = self.weights.get(key, 0.0)
            value = values[key]
            factors.append(
                MatchFactor(
                    key=key,
                    label=label,
                    score=value,
                    weight=round(weight, 4),
                    contribution=round(value * weight, 2),
                    detail=f"{_level(value)} ({value:.0f}%)",
                )
            )
        return factors


def _encode_documents(documents: dict[int, StandardDocument]) -> dict[int, Any]:
    """Encode candidate standard documents in one batch (much faster)."""
    if not documents:
        return {}
    ids = list(documents)
    texts = [documents[i].document for i in ids]
    try:
        matrix = embedding_service.encode(texts)
    except Exception as exc:  # noqa: BLE001 - never fail the request on encoding
        logger.warning("Batch document encoding failed (%s); falling back to per-item", exc)
        return {}
    return {sid: matrix[idx] for idx, sid in enumerate(ids)}


def relevance_label(score: float) -> str:
    if score >= 80:
        return "Very High"
    if score >= 65:
        return "High"
    if score >= 50:
        return "Moderate"
    if score >= 35:
        return "Low"
    return "Very Low"


engine = RecommendationEngine()


def to_decimal(value: float) -> Decimal:
    return Decimal(str(round(value, 2)))
