"""Requirement extraction (Step 3 of the pipeline).

This is a real, deterministic NLP pipeline - not a mock:

1. **Normalisation** - unicode folding, unit unification, boiler-plate removal.
2. **Sentence segmentation** - splits the specification into clauses.
3. **Entity extraction** - product, material, application, sector, quantity and
   numeric parameters are matched against curated lexicons (synonym maps,
   regex patterns) that cover Indian procurement vocabulary.
4. **Requirement typing** - each extracted clause is classified as
   technical / performance / safety / material / testing / marking / inspection
   using cue-phrase patterns, then de-duplicated.
5. **Confidence** - derived from how many independent evidence signals fired,
   not invented.

An optional LLM pass (``AI_PROVIDER=openai``) can refine the extraction when
``AI_API_KEY`` is configured; failures degrade gracefully to the local result.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.embeddings import STOPWORDS, normalize_space, tokenize
from app.schemas.analysis import ExtractedRequirements

logger = get_logger(__name__)


# --------------------------------------------------------------------------- #
#  Lexicons
# --------------------------------------------------------------------------- #
PRODUCT_LEXICON: dict[str, tuple[str, ...]] = {
    # --- Safety & PPE ----------------------------------------------------
    "Safety Helmet": ("safety helmet", "industrial helmet", "hard hat", "helmet", "head protection"),
    "Safety Goggle": ("safety goggle", "safety glass", "protective goggle", "goggles", "eye protection", "visor"),
    "Safety Footwear": ("safety footwear", "safety shoe", "safety boot", "steel toe shoe", "footwear", "gum boot"),
    "Safety Glove": ("safety glove", "protective glove", "work glove", "gloves", "hand protection", "examination glove"),
    "Safety Harness": ("safety harness", "fall arrest", "full body harness", "safety belt", "life line"),
    "Ear Defender": ("ear defender", "ear plug", "ear muff", "hearing protection", "hearing protector"),
    "N95 Respirator": ("respirator", "n95", "dust mask", "filter mask", "breathing apparatus", "particulate filter"),
    "Fire Extinguisher": ("fire extinguisher", "fire fighting equipment", "extinguisher"),
    "Fire Retardant Fabric": ("fire retardant fabric", "flame retardant fabric", "fire resistant fabric", "fr fabric"),
    "Mosquito Net": ("mosquito net", "bed net", "insect net", "malaria net"),
    # --- Construction materials -----------------------------------------
    "Reinforcing steel bar (TMT)": ("tmt bar", "deformed bar", "deformed steel bar", "rebar", "reinforcement bar", "high strength deformed steel", "reinforcing steel"),
    "Stainless steel reinforcement bar": ("stainless steel reinforcement bar", "stainless rebar", "ss reinforcement bar"),
    "Reinforced Concrete": ("reinforced concrete", "rcc", "concrete mix", "ready mix concrete", "cement concrete"),
    "Portland Cement": ("portland cement", "ordinary portland cement", "opc", "cement"),
    "Glazed Ceramic Floor Tile": ("glazed ceramic", "ceramic floor tile", "floor tile", "vitrified tile", "wall tile", "tiles"),
    "Ceramic Floor Tile": ("ceramic tile", "ceramic floor tile", "tile"),
    "Fire Resistant Plywood": ("fire resistant plywood", "fire resistant board", "plywood", "blockboard", "shuttering plywood", "flush door"),
    "MS Handrail": ("handrail", "hand rail", "ms railing", "stair railing", "guard rail"),
    "MS pipe (structural)": ("ms pipe", "structural pipe", "mild steel pipe", "structural hollow section"),
    # --- Water ------------------------------------------------------------
    "uPVC Drinking Water Pipe": ("upvc pipe", "upvc drinking water pipe", "uPVC pipe", "unplasticised pvc pipe", "drinking water pipe", "piping"),
    "HDPE Water Pipe": ("hdpe pipe", "hdpe water pipe", "high density polyethylene pipe", "hdpe"),
    "Galvanised Iron Pipe": ("galvanised iron pipe", "galvanized iron pipe", "gi pipe", "galvanised iron"),
    "Sanitary Ware (Wash Basin)": ("sanitary ware", "sanitaryware", "wash basin", "water closet", "toilet", "urinal"),
    "Brass Pipe and Fitting": ("brass pipe", "brass fitting", "brass and copper", "copper pipe fitting"),
    "Steel Water Pipe": ("steel water pipe", "steel pipe", "ms water pipe"),
    "Gate Valve": ("gate valve", "sluice valve", "butterfly valve", "ball valve", "check valve", "valve"),
    "Centrifugal Water Pump": ("centrifugal pump", "water pump", "pump set", "submersible pump", "pump"),
    "Radar Level Transmitter": ("level transmitter", "radar level", "level sensor", "transmitter"),
    "Chemicals for water treatment": ("water treatment chemical", "chlorination chemical", "alum", "water treatment"),
    # --- Electrical -------------------------------------------------------
    "XLPE Power Cable": ("power cable", "xlpe cable", "armoured cable", "electrical cable", "underground cable", "electric cable"),
    "PVC Insulated Copper Wire": ("copper wire", "pvc wire", "insulated wire", "house wiring", "electric wire", "wires and cables"),
    "LED Luminaire": ("led luminaire", "led light", "led fixture", "luminaire", "street light", "high bay", "flood light"),
    "MCB / Circuit Breaker": ("mcb", "circuit breaker", "miniature circuit breaker"),
    "Three Phase Induction Motor": ("induction motor", "three phase motor", "electric motor", "ac motor"),
    "Distribution Switchgear": ("switchgear", "distribution board", "panel board", "isolator", "cubicle"),
    # --- Mechanical -------------------------------------------------------
    "Steel Rivet": ("rivet", "steel rivet"),
    "Hexagonal Bolt and Nut": ("bolt and nut", "hex bolt", "hexagonal bolt", "anchor bolt", "fastener", "screw", "washer"),
    "Ball Bearing": ("ball bearing", "roller bearing", "bearing", "plain bearing"),
    "Industrial V-Belt": ("v-belt", "v belt", "belt drive", "industrial belt"),
    # --- Agriculture ------------------------------------------------------
    "Irrigation Steel Pipe": ("irrigation pipe", "irrigation steel pipe", "irrigation lateral"),
    "Drip Irrigation Lateral": ("drip irrigation", "drip lateral", "drip line", "irrigation lateral"),
    # --- Textiles ---------------------------------------------------------
    "Tarpaulin": ("tarpaulin", "tarpaulin sheet", "poly tarpaulin", "canvas sheet"),
    "Cotton Canvas": ("cotton canvas", "canvas fabric", "duck fabric", "cotton fabric"),
    # --- Food -------------------------------------------------------------
    "Stainless Steel Tableware": ("tableware", "stainless steel tableware", "steel plate", "cutlery", "utensil"),
    "Packaged Drinking Water": ("packaged drinking water", "drinking water bottle", "packaged water", "water bottle"),
    "Turmeric Powder": ("turmeric", "turmeric powder", "haldi", "spice powder", "spice"),
    # --- Healthcare -------------------------------------------------------
    "Hospital Bed": ("hospital bed", "medical bed", "bed pan", "patient bed"),
    "Surgical Examination Glove": ("surgical glove", "examination glove", "medical glove"),
}

MATERIAL_LEXICON: dict[str, tuple[str, ...]] = {
    "High Density Polyethylene (HDPE)": ("hdpe", "high density polyethylene", "high-density polyethylene"),
    "Polypropylene (PP)": ("polypropylene", "pp grade", "pp resin"),
    "uPVC": ("upvc", "unplasticised pvc", "unplasticized pvc", "u-pvc"),
    "PVC": ("pvc", "polyvinyl chloride"),
    "Stainless Steel": ("stainless steel", "ss 304", "ss 316", "austenitic stainless"),
    "Mild Steel": ("mild steel", "ms steel", "low carbon steel", "structural steel"),
    "Cast Iron": ("cast iron", "ductile iron", "grey iron"),
    "Galvanised Iron": ("galvanised iron", "galvanized iron", "gi sheet", "galvanised steel"),
    "Aluminium": ("aluminium", "aluminum", "aluminium alloy"),
    "Brass": ("brass", "brass alloy"),
    "Copper": ("copper", "electrolytic copper", "copper conductor"),
    "Concrete": ("concrete", "cement concrete", "ready mix"),
    "Cement": ("cement", "portland cement"),
    "Ceramic": ("ceramic", "vitrified", "porcelain", "glazed tile"),
    "Plywood": ("plywood", "blockboard", "laminated veneer lumber"),
    "Cotton": ("cotton", "cotton fabric", "woven cotton"),
    "Polyester": ("polyester", "synthetic fibre"),
    "Rubber": ("rubber", "nitrile", "natural rubber", "latex"),
    "Bamboo": ("bamboo", "bamboo fibre"),
    "Brass / Copper Alloy": ("brass and copper", "copper alloy", "non ferrous alloy"),
}

APPLICATION_LEXICON: dict[str, tuple[str, ...]] = {
    "Construction Site": ("construction site", "site work", "building site", "civil work", "structural work"),
    "Construction": ("construction", "building", "civil", "infrastructure", "road work", "bridge", "housing"),
    "Industrial / Manufacturing": ("industrial", "manufacturing", "factory", "plant", "production line", "processing unit"),
    "Mining": ("mining", "mine", "underground mine", "open cast"),
    "Agriculture": ("agriculture", "agricultural", "farm", "farming", "rural", "kharif", "rabi", "crop", "irrigation"),
    "Healthcare": ("healthcare", "hospital", "medical", "clinic", "health centre", "pharmaceutical", "patient"),
    "Water Supply": ("water supply", "water distribution", "potable water", "drinking water", "pipeline", "municipal"),
    "Sanitation": ("sanitation", "sewerage", "sewage", "wastewater", "drainage", "septic"),
    "Power / Energy": ("power", "electrical", "electricity", "energy", "substation", "power distribution"),
    "Transportation": ("transport", "road", "highway", "railway", "tunnel", "bridge"),
    "Defence": ("defence", "defense", "military", "paramilitary", "border"),
    "Education": ("school", "education", "college", "university"),
    "Household": ("household", "domestic", "residential", "home use"),
    "Hospitality": ("hotel", "restaurant", "hospitality", "catering", "food service"),
    "Textiles / Apparel": ("textile", "garment", "apparel", "clothing", "uniform", "fabric", "canvas"),
    "Office / Furniture": ("office furniture", "furniture", "workstation", "seating", "office use"),
    "Fire Protection": ("fire protection", "fire safety", "fire fighting", "fire prevention"),
    "Pumping Station": ("pumping station", "pump house", "water pumping"),
    "Solar Installation": ("solar installation", "rooftop solar", "solar plant", "photovoltaic installation"),
    "Worker Safety": ("worker safety", "construction worker", "site worker", "occupational safety", "industrial worker"),
}

# Sector labels are kept identical to the ``standards.sector`` values in the
# knowledge base so the sector factor compares like with like.
SECTOR_LEXICON: dict[str, tuple[str, ...]] = {
    "Safety": (
        "safety", "protection", "ppe", "personal protective", "worker safety",
        "occupational safety", "safety equipment", "fire fighting", "fire protection",
        "helmet", "goggle", "glove", "respirator", "harness", "ear defender",
    ),
    "Construction": (
        "construction", "civil", "structural", "building material", "cement",
        "concrete", "brick", "plywood", "tile", "building", "reinforcement",
    ),
    "Electrical": (
        "electrical", "electric", "cable", "wiring", "switchgear", "power distribution",
        "luminaire", "lighting", "light", "fixture", "lamp", "transformer", "conductor",
        "circuit breaker", "switch board",
    ),
    "Mechanical": (
        "mechanical", "machinery", "bearing", "fastener", "bolt", "nut", "belt",
        "motor", "pump", "valve", "rivet", "transmitter", "steel",
    ),
    "Water": (
        "water", "pipeline", "piping", "sanitation", "sewerage", "irrigation",
        "potable", "valve", "pump", "treatment",
    ),
    "Agriculture": ("agriculture", "farm", "fertilizer", "fertiliser", "seed", "crop", "agro", "drip"),
    "Textiles": ("textile", "fabric", "garment", "cotton", "yarn", "canvas", "tarpaulin"),
    "Food": ("food", "edible", "beverage", "dairy", "spice", "grain", "nutrition", "packaged water", "tableware"),
    "Healthcare": ("healthcare", "medical", "hospital", "pharmaceutical", "clinical", "surgical", "patient"),
    "Chemical": ("chemical", "chemical compound", "reagent", "water treatment chemical"),
}

REQUIREMENT_CUE_PATTERNS: dict[str, tuple[str, ...]] = {
    "safety": (
        r"protects? against", r"safety", r"protective", r"guard", r"ppe",
        r"prevent(?:s|ing)? (?:injury|accident)", r"fire ?resistan", r"non-?toxic",
        r"harmless", r"protection against", r"survives? impact", r"shock absor",
    ),
    "performance": (
        r"performan", r"efficien", r"capacity", r"throughput", r"durab", r"life ?span",
        r"service life", r"load ?bearing", r"strength", r"power consumption", r"warranty",
        r"guarantee", r"output", r"efficiency of", r"resistan",
    ),
    "technical": (
        r"dimension", r"toleran", r"thick", r"grade", r"specification", r"conform",
        r"comply", r"standard", r"size", r"weight", r"composition", r"shall be",
        r"must be", r"requirement", r"parameter", r"measurement",
    ),
    "testing": (
        r"test(?:ed|ing|s)?", r"inspection", r"verification", r"calibrat", r"sampling",
        r"certificate", r"test report", r"laborator", r"third party", r"qc",
    ),
    "material": (
        r"material", r"made of", r"grade of", r"fabricated from", r"raw material",
        r"composition", r"recycled", r"virgin",
    ),
    "marking": (
        r"marking", r"labell?ed", r"logo", r"name plate", r"nameplate", r"stamped", r"brand name",
    ),
    "inspection": (
        r"inspection", r"third party", r"pre-?shipment", r"acceptance", r"quality assurance", r"qa/", r"qc/",
    ),
    "durability": (
        r"corrosion", r"weather", r"uv", r"moisture", r"abrasion", r"wear", r"long life", r"fade",
    ),
}

QUANTITY_RE = re.compile(
    r"\b(?P<qty>\d[\d,._]*)\s*(?P<unit>nos\.?|numbers?|units?|pcs?|pieces?|sets?|pairs?|kg|"
    r"kgs|kilograms?|tonnes?|tons?|tons|mt|mtrs?|meters?|metres?|m2|sq\.?\s*m|"
    r"sqm|cubic ?m|cm3|litres?|liters?|ml|dozen|kg?\.?)\b",
    re.IGNORECASE,
)

# Fallback for "1000 safety helmets" / "500 metres of pipe" - an optional
# qualifier word sits between the count and the plural noun.
QUANTITY_COUNT_RE = re.compile(
    r"\b(?P<qty>\d[\d,._]*)\s+(?:nos\.?\s+)?(?:\w{2,}\s+)?(?P<noun>[a-z]{3,}(?:s|es))\b",
    re.IGNORECASE,
)

_UNIT_LABELS = {
    "no": "Nos", "nos": "Nos", "number": "Nos", "numbers": "Nos", "unit": "Nos",
    "units": "Nos", "pc": "Nos", "pcs": "Nos", "piece": "Nos", "pieces": "Nos",
    "set": "Sets", "sets": "Sets", "pair": "Pairs", "pairs": "Pairs",
    "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    "tonne": "MT", "tonnes": "MT", "ton": "MT", "tons": "MT", "mt": "MT",
    "mtr": "m", "mtrs": "m", "m": "m", "meter": "m", "meters": "m",
    "metre": "m", "metres": "m",
    "m2": "m2", "sqm": "m2", "cm3": "m3", "litre": "L", "litres": "L",
    "liter": "L", "liters": "L", "ml": "mL", "dozen": "Dozen",
}

PARAM_PATTERNS: dict[str, re.Pattern[str]] = {
    "quantity": re.compile(
        r"\b(?P<value>\d[\d,._]*)\s*(?P<unit>nos|units|pieces|pcs|kg|tonnes|tons|mtrs|metres|"
        r"m2|litres|dozen)\b",
        re.IGNORECASE,
    ),
    "pressure_mpa": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*mpa\b", re.IGNORECASE),
    "pressure_bar": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*bar\b", re.IGNORECASE),
    "voltage_v": re.compile(r"\b(?P<value>\d{2,4})\s*v(?:olts?|oltage)?\b", re.IGNORECASE),
    "temperature_c": re.compile(r"(?P<value>-?\d+(?:\.\d+)?)\s*(?:\u00b0\s*c|deg c|celsius)\b", re.IGNORECASE),
    "diameter_mm": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*mm\s*(?:dia|diameter|bore|nb)\b", re.IGNORECASE),
    "power_kw": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*kw\b", re.IGNORECASE),
    "weight_kg": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*kg\b", re.IGNORECASE),
    "tolerance_pct": re.compile(r"(?P<value>\+?-?\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
    "impact_energy_j": re.compile(r"\b(?P<value>\d+(?:\.\d+)?)\s*j(?:oules?)?\b", re.IGNORECASE),
    "lumens": re.compile(r"\b(?P<value>\d{3,7})\s*lumens?\b", re.IGNORECASE),
    "warranty_years": re.compile(r"(?P<value>\d+)\s*(?:\+)?\s*year\s*warrant", re.IGNORECASE),
    "ip_rating": re.compile(r"\b(?P<value>ip)\s*(?P<rating>\d{2})\b", re.IGNORECASE),
    "class_grade": re.compile(r"\b(?:grade|class|grade\s*)?(?P<value>fe\s?\d{3}|m\s?\d{2}|is\s?\d{3,5})\b", re.IGNORECASE),
}

_SENTENCE_SPLIT = re.compile(r"(?<=[.;])\s+|\n+")
_WHITESPACE = re.compile(r"\s+")
_HYPHEN_BREAK = re.compile(r"(?<=[a-z])-\s+(?=[a-z])")


@dataclass(slots=True)
class ExtractedClause:
    """One requirement sentence plus its typing evidence."""

    text: str
    types: list[str] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)

    @property
    def primary_type(self) -> str:
        return self.types[0] if self.types else "other"


# --------------------------------------------------------------------------- #
#  Step 2 - normalisation
# --------------------------------------------------------------------------- #
_UNIT_CANON = (
    (re.compile(r"\bcu\.?\s?m\.?\b", re.I), "cubic metre"),
    (re.compile(r"\bm\.?\s?3\b", re.I), "cubic metre"),
    (re.compile(r"\bm2\b|\bsqm\.?\b|\bsq\.?\s?m\.?\b", re.I), "square metre"),
    (re.compile(r"\bmt\b", re.I), "metric tonne"),
    (re.compile(r"\bmtrs?\.?\b|\bmeters?\b|\bmetres?\b", re.I), "metre"),
    (re.compile(r"\bnos?\.?\b|\bnumbers?\b|\bunits?\b|\bpcs?\b|\bpieces?\b", re.I), "nos"),
    (re.compile(r"\bkg\b|\bkgs\b|\bkilograms?\b", re.I), "kg"),
)

_ACRONYM_EXPANSIONS = (
    (re.compile(r"\bPPE\b", re.I), "personal protective equipment"),
    (re.compile(r"\bRCC\b"), "reinforced concrete"),
    (re.compile(r"\bTMT\b"), "high strength deformed steel bar TMT"),
    (re.compile(r"\bMS\b(?=\s*(?:pipe|angle|channel|beam|bar))"), "mild steel"),
    (re.compile(r"\bSS\b(?=\s*(?:304|316|pipe|rod|bar))"), "stainless steel"),
    (re.compile(r"\bUPVC\b", re.I), "uPVC"),
    (re.compile(r"\bPVC\b"), "PVC"),
    (re.compile(r"\bMCB\b"), "miniature circuit breaker"),
    (re.compile(r"\bXLPE\b"), "cross linked polyethylene"),
    (re.compile(r"\bIS\s*(\d{3,5})", re.I), r"Indian Standard IS \1"),
    (re.compile(r"\bASTM\b"), "ASTM"),
    (re.compile(r"\bNPT\b"), "national pipe thread"),
    (re.compile(r"\bOHS\b"), "occupational health and safety"),
)


def normalize_text(text: str) -> str:
    """Step 2: clean, fold units, expand well-known procurement acronyms."""
    if not text:
        return ""
    folded = unicodedata.normalize("NFKC", text)
    folded = folded.replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")
    folded = re.sub(r"[`*_#>]+", " ", folded)
    folded = re.sub(r"\s+", " ", folded).strip()
    for pattern, replacement in _ACRONYM_EXPANSIONS:
        folded = pattern.sub(replacement, folded)
    for pattern, replacement in _UNIT_CANON:
        folded = pattern.sub(f" {replacement} ", folded)
    folded = _WHITESPACE.sub(" ", folded)
    return folded.strip()


def segment_clauses(text: str) -> list[str]:
    """Split a specification into clause-sized sentences (min 3 words)."""
    parts: list[str] = []
    for chunk in _SENTENCE_SPLIT.split(text or ""):
        if not chunk:
            continue
        cleaned = chunk.strip(" ,;:-")
        if len(cleaned.split()) >= 3:
            parts.append(cleaned)
    return parts


# --------------------------------------------------------------------------- #
#  Step 3 - entity extraction
# --------------------------------------------------------------------------- #
def _lookup_lexicon(
    text: str,
    lexicon: dict[str, tuple[str, ...]],
    *,
    limit: int = 3,
    boosts: dict[str, int] | None = None,
) -> list[tuple[str, int]]:
    """Return ``[(label, score), ...]`` best-first for lexicon phrase hits.

    Ties are broken by declaration order in ``lexicon`` (meaningful: the most
    specific / most common sector is listed first), never alphabetically.
    """
    lowered = text.lower()
    scored: list[tuple[int, int, str]] = []  # (score, -declaration_index, label)
    for index, (label, phrases) in enumerate(lexicon.items()):
        best = 0
        for phrase in phrases:
            if " " in phrase:
                occurrences = lowered.count(phrase)
                if occurrences:
                    best = max(best, 10 + occurrences * 4)
            elif _token_present(lowered, phrase):
                best = max(best, 6)
        if best:
            best += (boosts or {}).get(label, 0)
            scored.append((best, -index, label))
    scored.sort(key=lambda item: (-item[0], -item[1]))
    return [(label, score) for score, _index, label in scored[:limit]]


def _token_present(haystack_lower: str, phrase: str) -> bool:
    """Word-boundary match that also accepts a simple plural form."""
    pattern = re.escape(phrase)
    return bool(
        re.search(rf"(?<![a-z]){pattern}(?:s|es)?(?![a-z])", haystack_lower)
    )


def _extract_quantity(text: str) -> str | None:
    match = QUANTITY_RE.search(text)
    if match:
        value = match.group("qty").replace(",", "").rstrip(".")
        unit = re.sub(r"[.\s]+", "", match.group("unit")).lower()
        return f"{_fmt_qty(value)} {_UNIT_LABELS.get(unit, unit)}"

    fallback = QUANTITY_COUNT_RE.search(text)
    if fallback:
        value = fallback.group("qty").replace(",", "").rstrip(".")
        noun = fallback.group("noun").lower()
        if value.isdigit() and int(value) >= 2 and len(noun) >= 4:
            return f"{int(value):,} {noun}"
    return None


def _fmt_qty(value: str) -> str:
    return f"{int(value):,}" if value.isdigit() else value


def _extract_parameters(text: str) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for name, pattern in PARAM_PATTERNS.items():
        match = pattern.search(text)
        if not match:
            continue
        if name == "ip_rating":
            params["ip_rating"] = f"{match.group('value').upper()}{match.group('rating')}"
            continue
        raw = match.group("value")
        raw = raw.replace(",", "").strip()
        try:
            number = float(raw)
        except ValueError:
            continue
        params[name] = int(number) if number.is_integer() else number
    if params:
        params["numeric_values"] = [
            v for k, v in params.items() if isinstance(v, (int, float)) and k != "numeric_values"
        ]
    return params


def _classify_clause(clause: str) -> list[str]:
    """Type a clause using cue-phrase patterns (safety / performance / ...)."""
    lowered = clause.lower()
    order = list(REQUIREMENT_CUE_PATTERNS)
    hits: list[tuple[str, int]] = []
    for type_name, patterns in REQUIREMENT_CUE_PATTERNS.items():
        count = sum(1 for pattern in patterns if re.search(pattern, lowered))
        if count:
            hits.append((type_name, count))
    # Most cue hits first; ties resolved by the declared priority order.
    hits.sort(key=lambda item: (-item[1], order.index(item[0])))
    return [name for name, _ in hits]


# --------------------------------------------------------------------------- #
#  Public API
# --------------------------------------------------------------------------- #
def extract_requirements(
    specification: str,
    *,
    product_category: str | None = None,
    sector: str | None = None,
    material: str | None = None,
    application: str | None = None,
    quantity: str | None = None,
    technical_requirements: str | None = None,
    additional_requirements: str | None = None,
    use_llm: bool = True,
) -> ExtractedRequirements:
    """Run the full extraction pipeline over a procurement specification."""
    raw = normalize_text(specification)
    structured_parts = [
        normalize_text(technical_requirements),
        normalize_text(additional_requirements),
    ]
    combined = " . ".join(p for p in [raw, *structured_parts] if p)
    lowered = combined.lower()

    notes: list[str] = []
    signals = 0

    # -- product ------------------------------------------------------- #
    product_hits = _lookup_lexicon(combined, PRODUCT_LEXICON, limit=4)
    explicit_product = normalize_text(product_category)
    if explicit_product:
        product = explicit_product
        signals += 1
        notes.append("Product taken from the user-supplied product category field.")
    elif product_hits:
        product = product_hits[0][0]
        signals += 1
    else:
        product = _guess_product_from_head(combined)
        if product:
            signals += 1
            notes.append("Product inferred from the leading noun phrase of the specification.")

    # -- material ------------------------------------------------------ #
    material_hits = _lookup_lexicon(combined, MATERIAL_LEXICON, limit=3)
    explicit_material = normalize_text(material)
    if explicit_material:
        material_value = explicit_material
        signals += 1
    elif material_hits:
        material_value = material_hits[0][0]
        signals += 1
    else:
        material_value = None
    if product and material_value and material_value.lower() not in product.lower():
        # Keep them separate: the product label stays the catalogue product.
        pass

    # -- application --------------------------------------------------- #
    application_hits = _lookup_lexicon(combined, APPLICATION_LEXICON, limit=3)
    explicit_application = normalize_text(application)
    if explicit_application:
        application_value = explicit_application
        signals += 1
    elif application_hits:
        application_value = application_hits[0][0]
        signals += 1
    else:
        application_value = None

    # -- sector -------------------------------------------------------- #
    # A product-to-sector boost keeps "safety helmets for construction workers"
    # classified under Safety (the item) rather than Construction (the site).
    sector_boosts: dict[str, int] = {}
    product_sector = _default_sector_for_product(product) if product else None
    if product_sector:
        sector_boosts[product_sector] = 8

    sector_hits = _lookup_lexicon(combined, SECTOR_LEXICON, limit=3, boosts=sector_boosts)
    explicit_sector = normalize_text(sector)
    if explicit_sector:
        sector_value = explicit_sector
        signals += 1
    elif sector_hits:
        sector_value = sector_hits[0][0]
        signals += 1
        others = [h[0] for h in sector_hits[1:]]
        if product_sector and sector_value != product_sector:
            notes.append(
                f"Sector inferred as '{sector_value}' from cue phrases; the detected product "
                f"({product}) is normally catalogued under '{product_sector}'. "
            )
        if others:
            notes.append(f"Other sector candidates considered: {', '.join(others)}.")
    elif product_sector:
        sector_value = product_sector
        notes.append("Sector defaulted from the product-to-sector mapping table.")
    else:
        sector_value = None

    # -- quantity ------------------------------------------------------ #
    quantity_value = normalize_text(quantity) or _extract_quantity(combined)
    if quantity_value:
        signals += 1

    # -- requirements -------------------------------------------------- #
    clauses = segment_clauses(combined)
    if product:
        clauses.insert(0, f"Procurement of {product} for {application_value or 'general use'}")
    typed: list[ExtractedClause] = []
    seen: set[str] = set()
    for clause in clauses:
        types = _classify_clause(clause)
        key = " ".join(sorted(tokenize(clause)[:14]))
        if not key or key in seen:
            continue
        seen.add(key)
        typed.append(
            ExtractedClause(
                text=_tidy_clause(clause),
                types=types or ["technical"],
                matched_keywords=sorted(set(tokenize(clause)) & _lexicon_tokens())[:6],
            )
        )
    if typed:
        signals += 1

    requirements = [c.text for c in typed]
    technical = [c.text for c in typed if c.primary_type in {"technical", "material", "marking"}]
    safety = [c.text for c in typed if c.primary_type == "safety"]
    performance = [c.text for c in typed if c.primary_type in {"performance", "durability"}]

    parameters = _extract_parameters(combined)
    if parameters:
        signals += 1

    keywords = _derive_keywords(combined, product, material_value, application_value, typed)

    confidence = _confidence(signals, total_possible=6, clause_count=len(typed))
    if confidence < 0.45:
        notes.append(
            "Low extraction confidence - the specification is short or uses unusual vocabulary. "
            "Add technical detail, or edit the extracted fields and re-analyse."
        )

    result = ExtractedRequirements(
        product=product,
        material=material_value,
        application=application_value,
        sector=sector_value,
        category=product,
        quantity=quantity_value,
        requirements=requirements[:15],
        technical_requirements=technical[:10],
        safety_requirements=safety[:10],
        performance_requirements=performance[:10],
        parameters=parameters,
        keywords=keywords[:25],
        confidence=round(confidence, 3),
        source="nlp",
        notes=notes,
    )

    if use_llm and settings.ai_provider and settings.ai_api_key:
        result = _refine_with_llm(result, raw)
    return result


def _tidy_clause(clause: str) -> str:
    text = _HYPHEN_BREAK.sub("", clause)
    text = re.sub(r"^(?:that|which|should|must|shall|it|they|we|also)\s+", "", text, flags=re.I)
    text = text.strip(" .,;:-")
    return text[:400]


def _lexicon_tokens() -> set[str]:
    global _LEXICON_TOKENS
    if _LEXICON_TOKENS is None:
        tokens: set[str] = set()
        for lexicon in (PRODUCT_LEXICON, MATERIAL_LEXICON, APPLICATION_LEXICON, SECTOR_LEXICON):
            for phrases in lexicon.values():
                for phrase in phrases:
                    tokens.update(tokenize(phrase))
        _LEXICON_TOKENS = tokens
    return _LEXICON_TOKENS


_LEXICON_TOKENS: set[str] | None = None


def _guess_product_from_head(text: str) -> str | None:
    """Best-effort head-noun guess: 'purchase 1000 safety helmets' -> Safety Helmet."""
    tokens = tokenize(text)
    if not tokens:
        return None
    for length in (3, 2, 1):
        for start in range(0, min(len(tokens) - length + 1, 8)):
            phrase = " ".join(tokens[start : start + length])
            for label, phrases in PRODUCT_LEXICON.items():
                if any(p == phrase for p in phrases):
                    return label
    return None


# Fallback mapping used only when the specification gives no sector cue at all.
# Values match the ``standards.sector`` labels in the knowledge base.
_PRODUCT_SECTOR_MAP = {
    "Safety Helmet": "Safety",
    "Safety Goggle": "Safety",
    "Safety Footwear": "Safety",
    "Safety Glove": "Safety",
    "Safety Harness": "Safety",
    "Ear Defender": "Safety",
    "N95 Respirator": "Safety",
    "Fire Extinguisher": "Safety",
    "Fire Retardant Fabric": "Safety",
    "Mosquito Net": "Textiles",
    "Reinforcing steel bar (TMT)": "Construction",
    "Stainless steel reinforcement bar": "Construction",
    "Reinforced Concrete": "Construction",
    "Portland Cement": "Construction",
    "Glazed Ceramic Floor Tile": "Construction",
    "Ceramic Floor Tile": "Construction",
    "Fire Resistant Plywood": "Construction",
    "MS Handrail": "Construction",
    "MS pipe (structural)": "Mechanical",
    "uPVC Drinking Water Pipe": "Water",
    "HDPE Water Pipe": "Water",
    "Galvanised Iron Pipe": "Water",
    "Sanitary Ware (Wash Basin)": "Water",
    "Brass Pipe and Fitting": "Water",
    "Steel Water Pipe": "Water",
    "Gate Valve": "Water",
    "Centrifugal Water Pump": "Water",
    "Radar Level Transmitter": "Mechanical",
    "Chemicals for water treatment": "Chemical",
    "XLPE Power Cable": "Electrical",
    "PVC Insulated Copper Wire": "Electrical",
    "LED Luminaire": "Electrical",
    "MCB / Circuit Breaker": "Electrical",
    "Three Phase Induction Motor": "Electrical",
    "Distribution Switchgear": "Electrical",
    "Steel Rivet": "Mechanical",
    "Hexagonal Bolt and Nut": "Mechanical",
    "Ball Bearing": "Mechanical",
    "Industrial V-Belt": "Mechanical",
    "Irrigation Steel Pipe": "Agriculture",
    "Drip Irrigation Lateral": "Agriculture",
    "Tarpaulin": "Textiles",
    "Cotton Canvas": "Textiles",
    "Stainless Steel Tableware": "Food",
    "Packaged Drinking Water": "Food",
    "Turmeric Powder": "Food",
    "Hospital Bed": "Healthcare",
    "Surgical Examination Glove": "Healthcare",
}


def _default_sector_for_product(product: str) -> str | None:
    return _PRODUCT_SECTOR_MAP.get(product)


def _derive_keywords(
    text: str,
    product: str | None,
    material: str | None,
    application: str | None,
    clauses: list[ExtractedClause],
) -> list[str]:
    """Salient terms: proper-noun-ish content words + lexicon phrases, ranked."""
    ranked: dict[str, int] = {}

    for value, boost in ((product, 12), (material, 9), (application, 7)):
        if value:
            for token in tokenize(value):
                ranked[token] = ranked.get(token, 0) + boost
            ranked[value.lower()] = ranked.get(value.lower(), 0) + boost + 3

    content = [t for t in tokenize(text) if t not in STOPWORDS]
    for token in content:
        if len(token) > 3:
            ranked[token] = ranked.get(token, 0) + 1

    for clause in clauses:
        for token in clause.matched_keywords:
            ranked[token] = ranked.get(token, 0) + 2

    return [k for k, _ in sorted(ranked.items(), key=lambda kv: (-kv[1], kv[0]))]


def _confidence(signals: int, *, total_possible: int, clause_count: int) -> float:
    base = signals / max(1, total_possible)
    detail_bonus = min(0.15, 0.03 * max(0, clause_count - 1))
    return max(0.0, min(1.0, base * 0.85 + detail_bonus))


# --------------------------------------------------------------------------- #
#  Optional LLM refinement
# --------------------------------------------------------------------------- #
def _refine_with_llm(base: ExtractedRequirements, specification: str) -> ExtractedRequirements:
    """Ask an optional LLM to refine the local extraction. Never required."""
    from app.services.llm import LLMUnavailable, refine_extraction

    try:
        payload = refine_extraction(specification, base)
    except LLMUnavailable as exc:
        base.notes.append(f"Optional LLM refinement skipped: {exc}")
        return base

    if payload.product:
        base.product = payload.product
    if payload.material:
        base.material = payload.material
    if payload.application:
        base.application = payload.application
    if payload.sector:
        base.sector = payload.sector
    extra = [r for r in payload.requirements if r not in base.requirements]
    if extra:
        base.requirements = (base.requirements + extra)[:15]
    if payload.keywords:
        merged = list(dict.fromkeys([*base.keywords, *payload.keywords]))
        base.keywords = merged[:25]
    base.source = "hybrid"
    base.notes.append("Refined with the configured external LLM provider.")
    return base
