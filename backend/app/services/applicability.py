"""SIH26108 - Applicability engine.

The demonstrator separates two questions that a plain search engine confuses:

    relevant  != applicable

1. **Retrieval** (keyword + sentence-transformer similarity) finds *possible*
   standards for a procurement specification.
2. **Applicability checking** (deterministic Python condition matching) decides
   whether each candidate's recorded scope conditions are actually satisfied by
   the officer's requirements.

Every decision is returned as an explicit requirement-vs-condition matrix plus a
plain-language reason, so the procurement officer can audit it. No similarity
percentage is ever used as an applicability decision.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from app.core.logging import get_logger
from app.ml.embeddings import embedding_service
from app.services import prototype_store

logger = get_logger(__name__)

# --------------------------------------------------------------------------- #
#  Constants
# --------------------------------------------------------------------------- #
UI_MESSAGE = (
    "Finding a relevant standard is not enough. Our AI checks whether the standard "
    "is actually applicable to the given procurement requirements."
)
DISCLAIMER = (
    "AI recommendation - final verification remains with the authorized procurement "
    "officer. Results are produced by this Smart India Hackathon prototype from a small "
    "curated demonstration knowledge base and are not a Bureau of Indian Standards "
    "certification, approval or compliance statement."
)

ApplicabilityStatus = Literal[
    "APPLICABLE",
    "CONDITIONALLY_APPLICABLE",
    "EXCLUDED",
    "SUPERSEDED",
    "CONFLICTING",
    "UNDETERMINED",
]

STATUS_ORDER: list[str] = [
    "APPLICABLE",
    "CONDITIONALLY_APPLICABLE",
    "EXCLUDED",
    "SUPERSEDED",
    "CONFLICTING",
    "UNDETERMINED",
]

STATUS_LABEL: dict[str, str] = {
    "APPLICABLE": "Applicable",
    "CONDITIONALLY_APPLICABLE": "Conditionally Applicable",
    "EXCLUDED": "Excluded",
    "SUPERSEDED": "Superseded",
    "CONFLICTING": "Conflicting",
    "UNDETERMINED": "Undetermined",
}

FIELD_LABELS: dict[str, str] = {
    "product_type": "Product Type",
    "capacity": "Capacity",
    "voltage": "Voltage",
    "application": "Application",
    "installation_location": "Installation Location",
    "material": "Material",
    "tank_material": "Water Vessel Material",
    "grade": "Grade",
    "diameter": "Nominal Size",
    "quantity": "Quantity",
    "safety": "Safety Requirement",
}

FIELD_ORDER: list[str] = [
    "product_type",
    "capacity",
    "voltage",
    "application",
    "installation_location",
    "material",
    "tank_material",
    "grade",
    "diameter",
    "quantity",
    "safety",
]

# --------------------------------------------------------------------------- #
#  Step 2 - requirement extraction (deterministic, always editable in the UI)
# --------------------------------------------------------------------------- #
_PRODUCT_TAXONOMY: list[tuple[str, str]] = [
    ("Rider Helmet", r"\brider helmets?\b|\btwo[\s-]?wheeler helmets?\b|\bmotorcycle helmets?\b|\bmotorcycl"),
    ("Electric Water Heater", r"\belectric\s+(?:storage\s+)?water\s+heater|\bwater\s+heater|\bgeyser\b|\bwater\s+g"),
    ("Safety Helmet", r"\bsafety\s+helmets?\b|\bindustrial\s+helmets?\b|\bhard\s+hats?\b|\bhelmets?\b"),
    ("TMT Rebar", r"\btmt\b|\bthermo[\s-]?mechanically\s+tempered\b|\bdeformed\s+(?:steel\s+)?bars?\b|\brebars?\b|\breinforcing\s+bars?\b"),
    ("uPVC Pipe", r"\bupvc\b|\bu[\s-]?pvc\b|\bunplasticized\s+polyvinyl\b|\bunplasticised\s+polyvinyl\b"),
    ("PVC Pipe", r"\bpvc\s+pipes?\b"),
]

_CAPACITY_RE = re.compile(
    r"(?<![\w.])(?P<value>\d[\d,\s]*?(?:\.\d+)?)\s*"
    r"(?P<unit>kilolitres?|kiloliters?|kilolitre|kiloliter|kl|litres?|liters?|litre|liter|ltr|ml|l)\b",
    re.IGNORECASE,
)
_VOLTAGE_RE = re.compile(r"(?<![\w.])(?P<value>\d{2,3})\s*(?P<unit>volts?|v)\b", re.IGNORECASE)
_DIAMETER_RE = re.compile(
    r"(?<![\w.])(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>millimetres?|millimeters?|mm)\b", re.IGNORECASE
)
_GRADE_RE = re.compile(r"\bfe\s?(?P<fe>\d{3})(?P<d>d)?\b|\bgrade\s?(?P<g>\d{2,3})\b", re.IGNORECASE)
_QUANTITY_RE = re.compile(
    r"(?<![\d.,])(?P<value>\d[\d,]*)\s+(?:[a-z]+\s+){0,2}"
    r"(?P<noun>helmets?|heaters?|geysers?|pipes?|bars?|rebars?|units?|pieces|pcs|nos|numbers?|"
    r"luminaires?|fittings?|valves?|tiles?|rods?|sheets?|cables?)\b",
    re.IGNORECASE,
)

_APPLICATION_RULES: list[tuple[str, str]] = [
    ("Potable Water", r"potable|drinking\s+water"),
    ("Drainage", r"drainage|soil\s+and\s+waste|sewer|effluent"),
    ("Construction", r"construction|building\s+site|infrastructure\s+project|civil\s+works?"),
    ("Mining", r"\bmining\b|quarry"),
    ("Institutional", r"institutional|\binstitution\b|school|college|university|hospital|hostel|canteen|"
                      r"office|library|government|public\s+(?:building|sector|health)|polyclinic|hostels"),
    ("Industrial", r"industrial|factory|manufacturing|process\s+plant|workshop|workshops"),
    ("Commercial", r"commercial|retail|\bshop\b|mall|hotel|restaurant|market|showroom"),
    ("Agricultural", r"agricultural|irrigation|\bfarm\b|greenhouse"),
    ("Domestic", r"domestic|household|residential|home\s+use|\bhome\b|apartment|villa|flat"),
]

_INSTALLATION_RULES: list[tuple[str, str]] = [
    ("Semi-outdoor", r"semi[\s-]?outdoor|semi[\s-]?open|covered\s+but\s+open"),
    ("Outdoor", r"outdoor|open\s+air|\broof\b|rooftop|exterior|outside\s+the\s+building"),
    ("Indoor", r"indoor|inside\s+the\s+building|interior|inside\s+room|plant\s+room"),
]

_MATERIAL_RULES: list[tuple[str, str]] = [
    ("Stainless Steel", r"stainless\s+steel|\bss\s?(?:304|316)\b"),
    ("Enamelled Steel", r"enamel(?:l?ed|ling)?\s+(?:lined\s+)?(?:steel|tank)|vitreous\s+enamel"),
    ("Copper", r"\bcopper\b"),
    ("Polycarbonate", r"polycarbonate"),
    ("ABS", r"\babs\b"),
    ("HDPE", r"\bhdpe\b|high\s+density\s+polyethylene"),
    ("uPVC", r"\bupvc\b|\bu[\s-]?pvc\b|unplasticized\s+polyvinyl|unplasticised\s+polyvinyl"),
    ("Mild Steel", r"mild\s+steel|carbon\s+steel|\bms\s+tank\b"),
    ("PVC", r"\bpvc\b"),
]

_TANK_MATERIAL_RULES: list[tuple[str, str]] = [
    ("Stainless Steel", r"stainless\s+steel"),
    ("Enamelled Steel", r"enamel(?:l?ed|ling)?|vitreous"),
    ("Copper", r"\bcopper\b"),
]

_STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "or", "to", "in", "with", "on", "by", "is", "are",
    "be", "this", "that", "from", "as", "at", "its", "per", "we", "our", "need", "required",
    "require", "should", "shall", "must", "into", "their", "any", "all", "also", "such",
}

_SYNONYMS: list[set[str]] = [
    {"domestic", "household", "residential", "home"},
    {"institutional", "institution", "school", "hospital", "hostel", "canteen", "office", "public"},
    {"industrial", "factory", "plant"},
    {"commercial", "retail", "business"},
    {"potable water", "drinking water", "potable"},
    {"geyser", "water heater", "electric water heater", "storage water heater"},
    {"safety helmet", "industrial safety helmet", "hard hat"},
    {"tmt", "rebar", "deformed steel bar", "reinforcing steel bar"},
    {"upvc", "pvc"},
    {"indoor", "inside", "interior"},
    {"outdoor", "outside", "open air"},
]


@dataclass(slots=True)
class RequirementField:
    """One officer-editable extracted requirement."""

    key: str
    label: str
    value: str | None = None
    numeric: float | None = None
    unit: str | None = None
    source: str = "extracted"  # extracted | user | derived
    confidence: float = 0.0
    critical: bool = False

    @property
    def is_missing(self) -> bool:
        return self.value is None or str(self.value).strip() == ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "value": self.value,
            "numeric": self.numeric,
            "unit": self.unit,
            "source": self.source,
            "confidence": round(self.confidence, 2),
            "critical": self.critical,
            "missing": self.is_missing,
        }


def _canon(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower().rstrip(".")


def _first_match(text: str, rules: list[tuple[str, str]]) -> str | None:
    lowered = text.lower()
    for label, pattern in rules:
        if re.search(pattern, lowered, re.IGNORECASE):
            return label
    return None


def _to_float(raw: str) -> float | None:
    try:
        return float(raw.replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def extract_requirements(
    specification: str,
    technical_requirements: str = "",
    provided: dict[str, Any] | None = None,
) -> dict[str, RequirementField]:
    """Deterministic extraction of typed requirements from free text.

    ``provided`` carries officer edits / clarification answers and always wins
    over what was parsed (source becomes ``user``).
    """
    text = " ".join(x for x in (specification or "", technical_requirements or "") if x).strip()
    fields: dict[str, RequirementField] = {
        key: RequirementField(key=key, label=FIELD_LABELS[key]) for key in FIELD_ORDER
    }

    # --- product type -----------------------------------------------------
    for label, pattern in _PRODUCT_TAXONOMY:
        if re.search(pattern, text, re.IGNORECASE):
            fields["product_type"].value = label
            fields["product_type"].confidence = 0.95
            break

    # --- capacity ---------------------------------------------------------
    for match in _CAPACITY_RE.finditer(text):
        unit = match.group("unit").lower()
        value = _to_float(match.group("value"))
        if value is None:
            continue
        if unit in {"ml"}:
            value, unit = value / 1000.0, "L"
        elif unit in {"kl", "kilolitre", "kilolitres", "kiloliter", "kiloliters"}:
            value, unit = value * 1000.0, "L"
        elif unit.startswith("l"):
            unit = "L"
        fields["capacity"].value = f"{_num(value)} L"
        fields["capacity"].numeric = value
        fields["capacity"].unit = "L"
        fields["capacity"].confidence = 0.9
        break

    # --- voltage ----------------------------------------------------------
    match = _VOLTAGE_RE.search(text)
    if match:
        value = _to_float(match.group("value"))
        if value and 40 <= value <= 1000:
            fields["voltage"].value = f"{_num(value)} V"
            fields["voltage"].numeric = value
            fields["voltage"].unit = "V"
            fields["voltage"].confidence = 0.92

    # --- application / installation / material / tank material ------------
    application = _first_match(text, _APPLICATION_RULES)
    if application:
        fields["application"].value = application
        fields["application"].confidence = 0.88

    location = _first_match(text, _INSTALLATION_RULES)
    if location:
        fields["installation_location"].value = location
        fields["installation_location"].confidence = 0.85

    material = _first_match(text, _MATERIAL_RULES)
    if material:
        fields["material"].value = material
        fields["material"].confidence = 0.85

    tank = _first_match(text, _TANK_MATERIAL_RULES)
    if tank:
        fields["tank_material"].value = tank
        fields["tank_material"].confidence = 0.8

    # --- grade ------------------------------------------------------------
    match = _GRADE_RE.search(text)
    if match:
        if match.group("fe"):
            grade = f"Fe {match.group('fe')}{match.group('d') or ''}".replace("fe ", "Fe ")
            grade = f"Fe {match.group('fe')}" + (match.group("d") or "")
        else:
            grade = f"Fe {match.group('g')}"
        fields["grade"].value = grade
        fields["grade"].confidence = 0.85

    # --- nominal size -----------------------------------------------------
    match = _DIAMETER_RE.search(text)
    if match:
        value = _to_float(match.group("value"))
        if value:
            fields["diameter"].value = f"{_num(value)} mm"
            fields["diameter"].numeric = value
            fields["diameter"].unit = "mm"
            fields["diameter"].confidence = 0.85

    # --- quantity ---------------------------------------------------------
    for match in _QUANTITY_RE.finditer(text):
        after = text[match.end("value") : match.end("value") + 12]
        if re.match(r"\s*(mm|cm|kg|kgs|v|volt|volts|litres?|liters?|litre|liter|ltr|l|inch|in)\b",
                    after, re.IGNORECASE):
            continue  # "110 mm pipe" is a size, not a quantity
        value = _to_float(match.group("value"))
        if value:
            fields["quantity"].value = f"{_num(value)} nos"
            fields["quantity"].numeric = value
            fields["quantity"].confidence = 0.75
            break

    # --- safety -----------------------------------------------------------
    if re.search(
        r"safety|protection|protective|shock[\s-]?proof|earth(?:ing)?|earthing|\bisi\b|"
        r"bureau of indian standards|\bis\s+mark\b|comply with|compliance",
        text,
        re.IGNORECASE,
    ):
        fields["safety"].value = "Required"
        fields["safety"].confidence = 0.8

    # --- officer edits / clarification answers always win ------------------
    for key, raw in (provided or {}).items():
        if key not in fields or raw is None:
            continue
        value = str(raw).strip()
        target = fields[key]
        target.value = value or None
        target.source = "user"
        target.confidence = 1.0
        target.numeric = _parse_number(value) if key in {"capacity", "voltage", "diameter"} else None
        if target.numeric is not None and not target.unit:
            target.unit = {"capacity": "L", "voltage": "V", "diameter": "mm"}.get(key)

    return fields


def _num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _parse_number(value: str) -> float | None:
    match = re.search(r"\d[\d,]*(?:\.\d+)?", value or "")
    return _to_float(match.group(0)) if match else None


# --------------------------------------------------------------------------- #
#  Step 3 - candidate retrieval (keyword + semantic similarity)
# --------------------------------------------------------------------------- #
_TOKEN_RE = re.compile(r"[a-z0-9]+")

_EMBED_CACHE: dict[str, list[Any]] = {}


def _tokens(text: str) -> set[str]:
    return {
        t for t in _TOKEN_RE.findall((text or "").lower())
        if t not in _STOPWORDS and len(t) > 1
    }


def _record_document(record: dict[str, Any]) -> str:
    parts = [
        record.get("title", ""),
        record.get("scope", ""),
        " ".join(record.get("product_types", [])),
        " ".join(record.get("keywords", [])),
        record.get("product_family", "").replace("-", " "),
        record.get("category", ""),
    ]
    for condition in record.get("conditions", []):
        parts.append(condition.get("label", ""))
        parts.append(condition.get("text", ""))
    return " ".join(p for p in parts if p)


def _record_vectors() -> list[Any]:
    records = prototype_store.load_knowledge_base()
    key = f"{prototype_store.knowledge_base_meta().get('kb_version')}::{embedding_service.model_name}"
    if key in _EMBED_CACHE and len(_EMBED_CACHE[key]) == len(records):
        return _EMBED_CACHE[key]
    documents = [_record_document(r) for r in records]
    vectors = list(embedding_service.encode(documents))
    _EMBED_CACHE[key] = vectors
    return vectors


def retrieve_candidates(
    fields: dict[str, RequirementField],
    specification: str,
    technical_requirements: str = "",
    top_k: int = 8,
) -> list[dict[str, Any]]:
    """Ranked candidate standards: semantic similarity + keyword overlap."""
    records = prototype_store.load_knowledge_base()
    if not records:
        return []

    product_type = (fields.get("product_type").value if fields.get("product_type") else None) or ""
    query_text = " ".join(x for x in (specification, technical_requirements, product_type) if x)
    query_tokens = _tokens(query_text)

    scores: list[tuple[float, float, float]] = []
    try:
        query_vector = embedding_service.encode_one(query_text)
        vectors = _record_vectors()
        for vector in vectors:
            scores.append((float(embedding_service.cosine(query_vector, vector)), 0.0, 0.0))
    except Exception as exc:  # noqa: BLE001 - retrieval must never fail the demo
        logger.warning("Semantic retrieval unavailable (%s); keyword search only", exc)
        scores = [(0.0, 0.0, 0.0) for _ in records]

    product_canon = _canon(product_type)
    ranked: list[tuple[float, dict[str, Any], float, float, float]] = []
    for record, (semantic, _, _) in zip(records, scores):
        record_tokens = _tokens(_record_document(record))
        overlap = len(query_tokens & record_tokens)
        keyword = min(1.0, overlap / max(4.0, min(len(query_tokens), 12)))
        family_hit = any(
            _canon(p) == product_canon for p in record.get("product_types", [])
        ) if product_canon else False
        score = 0.55 * max(0.0, semantic) + 0.45 * keyword + (0.25 if family_hit else 0.0)
        if score >= 0.30 or family_hit:
            ranked.append((score, record, semantic, keyword, float(family_hit)))

    ranked.sort(key=lambda item: -item[0])
    out: list[dict[str, Any]] = []
    for score, record, semantic, keyword, family_hit in ranked[: max(1, top_k)]:
        matched_terms = sorted(_tokens(_record_document(record)) & query_tokens)
        why = _why_selected(record, semantic, keyword, matched_terms, product_type, family_hit)
        out.append(
            {
                "record": record,
                "retrieval_score": round(min(score, 1.0), 3),
                "semantic_score": round(max(0.0, semantic), 3),
                "keyword_score": round(keyword, 3),
                "product_type_hit": bool(family_hit),
                "why_selected": why,
            }
        )
    return out


def _why_selected(
    record: dict[str, Any],
    semantic: float,
    keyword: float,
    matched_terms: list[str],
    product_type: str,
    family_hit: bool,
) -> list[str]:
    reasons: list[str] = []
    if family_hit:
        reasons.append(
            f"Product type '{product_type}' is listed inside this standard's recorded scope."
        )
    elif product_type:
        reasons.append(
            f"Scope text is close to the requested product type '{product_type}'."
        )
    if semantic >= 0.45:
        reasons.append("Scope wording is semantically close to the procurement specification.")
    elif semantic >= 0.25:
        reasons.append("Scope wording partially overlaps the procurement specification.")
    if matched_terms:
        reasons.append(
            "Keyword overlap with the specification: "
            + ", ".join(matched_terms[:8])
            + "."
        )
    if not reasons:
        reasons.append("Retrieved as a low-scoring candidate for completeness.")
    return reasons


# --------------------------------------------------------------------------- #
#  Step 4 - applicability checking (deterministic condition matching)
# --------------------------------------------------------------------------- #
def _equivalent(requested: str, allowed: list[str]) -> str | None:
    """Return the matched allowed value, or ``None`` on a mismatch."""
    req = _canon(requested)
    if not req:
        return None
    allowed_canon = [_canon(a) for a in allowed]
    for original, canon in zip(allowed, allowed_canon):
        if req == canon:
            return original
    for group in _SYNONYMS:
        if req in group:
            for original, canon in zip(allowed, allowed_canon):
                if canon in group:
                    return original
    for original, canon in zip(allowed, allowed_canon):
        if (req and req in canon) or (canon and canon in req):
            return original
    return None


def _condition_text(condition: dict[str, Any]) -> str:
    operator = condition.get("operator")
    if operator == "one_of":
        return ", ".join(condition.get("allowed", []))
    if operator == "range":
        return f"{_num(condition['min'])} - {_num(condition['max'])} {condition.get('unit', '')}".strip()
    if operator == "equals":
        return str(condition.get("equals", ""))
    return str(condition.get("text", ""))


def _check_condition(
    condition: dict[str, Any], fields: dict[str, RequirementField]
) -> dict[str, Any]:
    dimension = condition["dimension"]
    requested = fields.get(dimension)
    requirement_value = requested.value if requested and not requested.is_missing else None
    row: dict[str, Any] = {
        "dimension": dimension,
        "label": condition.get("label", FIELD_LABELS.get(dimension, dimension)),
        "requirement_value": requirement_value,
        "standard_condition": _condition_text(condition),
        "clause": condition.get("clause"),
        "critical": bool(condition.get("critical", True)),
        "condition_text": condition.get("text"),
        "operator": condition.get("operator"),
        "result": "missing",
        "detail": "",
    }

    if requirement_value is None:
        row["detail"] = (
            "Critical condition - not stated in the procurement specification."
            if row["critical"]
            else "Optional condition - not stated in the procurement specification."
        )
        return row

    operator = condition.get("operator")
    if operator in {"one_of", "equals"}:
        allowed = condition.get("allowed") or [condition.get("equals")]
        matched = _equivalent(requirement_value, [a for a in allowed if a])
        if matched:
            row["result"] = "match"
            row["detail"] = f"'{requirement_value}' is inside the recorded scope ({matched})."
        else:
            row["result"] = "mismatch"
            row["detail"] = f"'{requirement_value}' is not one of the recorded values."
    elif operator == "range":
        numeric = requested.numeric if requested else None
        if numeric is None:
            row["result"] = "missing"
            row["detail"] = "Value could not be read as a number - please restate it."
            return row
        low, high = float(condition["min"]), float(condition["max"])
        if low <= numeric <= high:
            row["result"] = "match"
            row["detail"] = f"{_num(numeric)} {condition.get('unit', '')} lies in {_num(low)} - {_num(high)} {condition.get('unit', '')}.".replace("  ", " ")
        else:
            row["result"] = "mismatch"
            row["detail"] = (
                f"{_num(numeric)} {condition.get('unit', '')} lies outside "
                f"{_num(low)} - {_num(high)} {condition.get('unit', '')}."
            )
    else:  # pragma: no cover - defensive
        row["detail"] = "Unsupported operator in the prototype record."
    return row


def check_applicability(
    record: dict[str, Any],
    fields: dict[str, RequirementField],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    """Compare the officer's requirements with one standard's recorded scope."""
    checks = [_check_condition(c, fields) for c in record.get("conditions", [])]

    mismatches = [c for c in checks if c["result"] == "mismatch"]
    missing_critical = [c for c in checks if c["result"] == "missing" and c["critical"]]
    missing_optional = [c for c in checks if c["result"] == "missing" and not c["critical"]]
    matched = [c for c in checks if c["result"] == "match"]

    # --- scope exclusions --------------------------------------------------
    exclusion_hits: list[dict[str, Any]] = []
    for exclusion in record.get("exclusions", []):
        dimension = exclusion["dimension"]
        requested = fields.get(dimension)
        value = requested.value if requested and not requested.is_missing else None
        if value is None:
            continue
        if _equivalent(value, exclusion.get("not_allowed", [])):
            allowed = ", ".join(record_allowed(record, dimension)) or "the recorded scope"
            exclusion_hits.append(
                {
                    "dimension": dimension,
                    "label": FIELD_LABELS.get(dimension, dimension),
                    "requirement_value": value,
                    "clause": exclusion.get("clause"),
                    "reason": (
                        f"The standard covers {allowed.lower()}, while the procurement "
                        f"requirement specifies {value.lower()}."
                    ),
                    "note": exclusion.get("note") or exclusion.get("reason"),
                    "standard_condition": f"Not: {', '.join(exclusion.get('not_allowed', []))}",
                    "result": "excluded",
                    "critical": True,
                    "detail": exclusion.get("reason", ""),
                }
            )

    # --- decide the status -------------------------------------------------
    status = _decide_status(record, checks, exclusion_hits, mismatches, missing_critical, missing_optional)
    reason, why_not = _explain(
        status,
        record,
        checks,
        exclusion_hits,
        mismatches,
        missing_critical,
        missing_optional,
        matched,
    )

    return {
        "standard_id": record["id"],
        "is_number": record["is_number"],
        "edition": record["edition"],
        "title": record["title"],
        "status": status,
        "status_label": STATUS_LABEL[status],
        "record_status": record.get("status", "current"),
        "record_status_label": record.get("status_label", ""),
        "scope": record.get("scope", ""),
        "sector": record.get("sector", ""),
        "category": record.get("category", ""),
        "year": record.get("year"),
        "why_selected": candidate.get("why_selected", []),
        "retrieval_score": candidate.get("retrieval_score", 0.0),
        "semantic_score": candidate.get("semantic_score", 0.0),
        "keyword_score": candidate.get("keyword_score", 0.0),
        "checks": checks + exclusion_hits,
        "matched_count": len(matched),
        "missing_critical": [c["label"] for c in missing_critical],
        "missing_optional": [c["label"] for c in missing_optional],
        "conflicting": [c["label"] for c in mismatches],
        "excluded_by": [e["label"] for e in exclusion_hits],
        "reason": reason,
        "why_not_applicable": why_not,
        "conditional_note": record.get("conditional_note", ""),
        "versions": record.get("versions", []),
        "related": record.get("related", []),
        "evidence": record.get("evidence", []),
        "missing_questions": [
            {
                "dimension": c["dimension"],
                "label": c["label"],
                "clause": c["clause"],
                "condition_text": c["condition_text"],
            }
            for c in missing_critical
        ],
        "conditions_total": len(checks),
    }


def record_allowed(record: dict[str, Any], dimension: str) -> list[str]:
    for condition in record.get("conditions", []):
        if condition["dimension"] == dimension and condition.get("allowed"):
            return list(condition["allowed"])
    return []


def _decide_status(
    record: dict[str, Any],
    checks: list[dict[str, Any]],
    exclusion_hits: list[dict[str, Any]],
    mismatches: list[dict[str, Any]],
    missing_critical: list[dict[str, Any]],
    missing_optional: list[dict[str, Any]],
) -> str:
    product_conflict = any(
        c["result"] == "mismatch" and c["dimension"] == "product_type" for c in checks
    )
    if exclusion_hits:
        return "EXCLUDED"
    if product_conflict:
        return "EXCLUDED"
    if mismatches:
        return "CONFLICTING"
    if record.get("status") == "superseded":
        return "SUPERSEDED"
    if missing_critical:
        return "UNDETERMINED"
    if missing_optional or record.get("conditional_note"):
        return "CONDITIONALLY_APPLICABLE"
    return "APPLICABLE"


def _explain(
    status: str,
    record: dict[str, Any],
    checks: list[dict[str, Any]],
    exclusion_hits: list[dict[str, Any]],
    mismatches: list[dict[str, Any]],
    missing_critical: list[dict[str, Any]],
    missing_optional: list[dict[str, Any]],
    matched: list[dict[str, Any]],
) -> tuple[str, str]:
    labels = ", ".join(c["label"] for c in missing_critical)
    matched_labels = ", ".join(c["label"] for c in matched)

    if status == "EXCLUDED":
        if exclusion_hits:
            hit = exclusion_hits[0]
            reason = hit["reason"]
            if hit.get("note"):
                reason = f"{reason} {hit['note']}"
        else:
            conflict = next(
                (c for c in checks if c["result"] == "mismatch" and c["dimension"] == "product_type"),
                mismatches[0] if mismatches else None,
            )
            reason = (
                f"The standard applies to {conflict['standard_condition']}, while the "
                f"procurement specification is for '{conflict['requirement_value']}'."
                if conflict
                else "The specification falls outside the recorded scope of this standard."
            )
        why_not = (
            "The product or application required by the tender is outside this standard's "
            "recorded scope, so quoting it would not cover the items being procured."
        )
        return reason, why_not

    if status == "CONFLICTING":
        conflict = mismatches[0]
        reason = (
            f"The specification requires {conflict['label'].lower()} = "
            f"'{conflict['requirement_value']}', but the standard records "
            f"{conflict['standard_condition']} ({conflict['clause']})."
        )
        why_not = (
            f"{conflict['label']} in the tender does not satisfy the condition recorded for "
            "this standard, so it cannot be applied as written."
        )
        return reason, why_not

    if status == "SUPERSEDED":
        reason = (
            f"Every recorded scope condition matches ({matched_labels}), but "
            f"{record['edition']} is marked '{record.get('status_label', 'superseded')}' in the "
            "prototype knowledge base."
        )
        why_not = (
            f"Do not cite a superseded edition - use the current edition shown in the version "
            "check for this standard."
        )
        return reason, why_not

    if status == "UNDETERMINED":
        reason = (
            "Not enough information: the procurement specification does not state "
            f"{labels}. The applicability decision is deferred until the officer supplies "
            "the missing value(s) - the prototype does not guess."
        )
        why_not = (
            f"Condition(s) for {labels} are recorded in the knowledge base but absent from the "
            "specification, so applicability can be neither confirmed nor rejected."
        )
        return reason, why_not

    if status == "CONDITIONALLY_APPLICABLE":
        missing = ", ".join(c["label"] for c in missing_optional)
        if missing:
            reason = (
                f"All critical scope conditions match ({matched_labels}). "
                f"{missing} is not stated, and the prototype knowledge base applies this "
                "standard subject to that confirmation."
            )
        else:
            reason = f"All critical scope conditions match ({matched_labels})."
        if record.get("conditional_note"):
            reason = f"{reason} {record['conditional_note']}"
        why_not = (
            f"Applicability is conditional until {missing.lower()} is confirmed against the "
            "tender documents."
            if missing
            else (record.get("conditional_note") or "A recorded scope condition still needs confirmation.")
        )
        return reason, why_not

    reason = (
        "All required conditions available in the prototype knowledge base match the "
        f"procurement specification ({matched_labels})."
    )
    return reason, ""


# --------------------------------------------------------------------------- #
#  Step 6 - clarification questions for missing critical conditions
# --------------------------------------------------------------------------- #
def build_clarifications(
    assessments: list[dict[str, Any]], fields: dict[str, RequirementField]
) -> list[dict[str, Any]]:
    questions: dict[str, dict[str, Any]] = {}
    records = {r["id"]: r for r in prototype_store.load_knowledge_base()}

    for assessment in assessments:
        if assessment["status"] != "UNDETERMINED":
            continue
        record = records.get(assessment["standard_id"], {})
        conditions = {c["dimension"]: c for c in record.get("conditions", [])}
        for missing in assessment["missing_questions"]:
            dimension = missing["dimension"]
            existing = fields.get(dimension)
            if existing and not existing.is_missing:
                continue
            condition = conditions.get(dimension, {})
            entry = questions.setdefault(
                dimension,
                {
                    "dimension": dimension,
                    "label": missing["label"],
                    "question": condition.get("question")
                    or f"Please specify the {missing['label'].lower()}.",
                    "options": list(condition.get("options") or []),
                    "affected_standards": [],
                    "why": "",
                },
            )
            edition = assessment["edition"]
            if edition not in entry["affected_standards"]:
                entry["affected_standards"].append(edition)
            clause = missing.get("clause") or "recorded scope condition"
            entry["why"] = (
                f"{edition} records a critical condition at {clause} "
                f"({missing.get('condition_text') or missing['label']}). "
                "Until this value is supplied the status stays Undetermined."
            )

    ordered = [q for _, q in sorted(questions.items(), key=lambda kv: FIELD_ORDER.index(kv[0]) if kv[0] in FIELD_ORDER else 99)]
    for entry in ordered:
        if not entry["options"]:
            entry["options"] = []
    return ordered


# --------------------------------------------------------------------------- #
#  Orchestrator
# --------------------------------------------------------------------------- #
def analyze(
    specification: str,
    technical_requirements: str = "",
    product_name: str = "",
    requirements: dict[str, Any] | None = None,
    top_k: int = 8,
) -> dict[str, Any]:
    """Full pipeline: extract -> retrieve -> check -> explain -> clarify."""
    started = time.perf_counter()
    pipeline: list[dict[str, Any]] = []

    def stage(key: str, label: str, detail: str) -> None:
        pipeline.append(
            {
                "key": key,
                "label": label,
                "status": "completed",
                "detail": detail,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            }
        )

    fields = extract_requirements(specification, technical_requirements, requirements)
    if product_name and not fields["product_type"].value:
        guess = extract_requirements(product_name, technical_requirements, requirements)
        if guess["product_type"].value:
            fields["product_type"] = guess["product_type"]
    stage(
        "extraction",
        "Extracting requirements",
        "; ".join(
            f"{f.label} = {f.value}"
            for f in fields.values()
            if not f.is_missing and f.key in FIELD_ORDER[:8]
        )
        or "no structured values detected",
    )

    meta = prototype_store.knowledge_base_meta()
    stage("knowledge_base", "Loading prototype knowledge base", f"{meta['size']} curated records")

    candidates = retrieve_candidates(fields, specification, technical_requirements, top_k=top_k)
    stage(
        "retrieval",
        "Finding candidate standards",
        f"{len(candidates)} candidate(s) above the retrieval threshold",
    )

    assessments = [check_applicability(c["record"], fields, c) for c in candidates]
    assessments.sort(key=lambda a: (STATUS_ORDER.index(a["status"]), -a["retrieval_score"]))
    summary = {status: 0 for status in STATUS_ORDER}
    for assessment in assessments:
        summary[assessment["status"]] += 1
    stage(
        "applicability",
        "Checking applicability against recorded scope conditions",
        ", ".join(f"{STATUS_LABEL[k]} {v}" for k, v in summary.items() if v),
    )

    clarifications = build_clarifications(assessments, fields)
    if clarifications:
        stage(
            "clarification",
            "Raising clarification questions",
            "; ".join(q["label"] for q in clarifications),
        )

    shown_fields = _visible_fields(fields, assessments)
    processing_ms = round((time.perf_counter() - started) * 1000, 1)
    stage("report", "Building applicability report", f"processed in {processing_ms} ms")

    return {
        "ui_message": UI_MESSAGE,
        "knowledge_base": meta,
        "specification": specification,
        "product_name": product_name,
        "requirements": {k: f.as_dict() for k, f in fields.items()},
        "fields": [f.as_dict() for f in shown_fields],
        "candidates": assessments,
        "summary": summary,
        "clarifications": clarifications,
        "pipeline": pipeline,
        "processing_ms": processing_ms,
        "disclaimer": DISCLAIMER,
    }


def _visible_fields(
    fields: dict[str, RequirementField], assessments: list[dict[str, Any]]
) -> list[RequirementField]:
    """Show extracted values plus any dimension a candidate condition needs."""
    referenced = {c["dimension"] for a in assessments for c in a["checks"]}
    visible: list[RequirementField] = []
    for key in FIELD_ORDER:
        current = fields[key]
        if not current.is_missing or key in referenced:
            visible.append(current)
    return visible


__all__ = [
    "DISCLAIMER",
    "FIELD_LABELS",
    "STATUS_LABEL",
    "STATUS_ORDER",
    "UI_MESSAGE",
    "RequirementField",
    "analyze",
    "check_applicability",
    "extract_requirements",
    "retrieve_candidates",
]
