"""Embedding service.

Primary encoder:
    sentence-transformers/all-MiniLM-L6-v2 (384-dim)

Supported modes:

1. sentence-transformers
   Uses the semantic SentenceTransformer model.
   Recommended for local development when the package is installed.

2. hash / fallback / lightweight
   Uses a deterministic hashed unigram + bigram encoder.
   Recommended for low-memory deployments such as Render Free.

The backend can be selected using:

    EMBEDDING_BACKEND=sentence-transformers

or:

    EMBEDDING_BACKEND=hash

The encoder is loaded lazily and only once per process.
"""

from __future__ import annotations

import hashlib
import math
import re
import threading
from collections.abc import Sequence

import numpy as np

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Small stop-word list. Procurement terminology is intentionally
# preserved so that important technical words survive tokenisation.
STOPWORDS: frozenset[str] = frozenset(
    """
    a an and are as at be been being by for from has have in into is it its of
    on or that the their there these this to was were will with we our us they
    them should need needs needed require required requirement requirements
    shall must may purchase procure procurement specification spec please provide
    also
    """.split()
)


def tokenize(text: str) -> list[str]:
    """Lower-case, remove punctuation, and drop stop-words."""
    tokens = _TOKEN_RE.findall(text.lower())
    return [token for token in tokens if token not in STOPWORDS and len(token) > 1]


# --------------------------------------------------------------------------- #
# Sentence-transformer encoder
# --------------------------------------------------------------------------- #
class _SentenceTransformerEncoder:
    """Semantic encoder using Sentence Transformers."""

    name = "sentence-transformers"

    def __init__(self, model_name: str) -> None:
        # IMPORTANT:
        # This import is deliberately local.
        #
        # Render lightweight/hash deployments do not install
        # sentence-transformers, so importing it at module level would
        # break the entire application.
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(
            model_name,
            device="cpu",
        )

        self.dim = int(
            self._model.get_sentence_embedding_dimension()
        )

        self.model_name = model_name

        logger.info(
            "Loaded embedding model %s (dim=%s)",
            model_name,
            self.dim,
        )

    def encode(
        self,
        texts: Sequence[str],
    ) -> np.ndarray:
        """Encode text using Sentence Transformers."""

        vectors = self._model.encode(
            list(texts),
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
            batch_size=32,
        )

        return np.asarray(
            vectors,
            dtype=np.float32,
        )


# --------------------------------------------------------------------------- #
# Deterministic lightweight encoder
# --------------------------------------------------------------------------- #
class _HashingEncoder:
    """Lightweight deterministic hashed unigram + bigram encoder.

    Features:

    - No model download
    - No PyTorch
    - No Sentence Transformers
    - Works offline
    - Deterministic
    - L2-normalised vectors
    - Suitable for low-memory deployment

    This is less semantically powerful than Sentence Transformers,
    but it allows the recommendation engine to operate on small
    hosting instances such as Render Free.
    """

    name = "hash-fallback"

    def __init__(self, dim: int) -> None:
        self.dim = max(1, int(dim))
        self.model_name = f"hashed-ngram-{self.dim}"

    def encode(
        self,
        texts: Sequence[str],
    ) -> np.ndarray:
        """Encode text into deterministic hashed vectors."""

        text_list = list(texts)

        out = np.zeros(
            (len(text_list), self.dim),
            dtype=np.float32,
        )

        for row, text in enumerate(text_list):
            tokens = tokenize(text)

            if not tokens:
                continue

            # Unigrams
            features = list(tokens)

            # Bigrams
            features.extend(
                f"{first}_{second}"
                for first, second in zip(
                    tokens,
                    tokens[1:],
                )
            )

            counts: dict[int, float] = {}

            for feature in features:
                digest = hashlib.blake2b(
                    feature.encode("utf-8"),
                    digest_size=8,
                ).digest()

                index = (
                    int.from_bytes(
                        digest,
                        "big",
                    )
                    % self.dim
                )

                # Signed hashing reduces the effect of collisions.
                sign = (
                    1.0
                    if digest[0] % 2 == 0
                    else -1.0
                )

                counts[index] = (
                    counts.get(index, 0.0) + sign
                )

            for index, value in counts.items():
                out[row, index] = value

        # L2 normalisation.
        norms = np.linalg.norm(
            out,
            axis=1,
            keepdims=True,
        )

        norms[norms == 0] = 1.0

        return out / norms


# --------------------------------------------------------------------------- #
# Public embedding service
# --------------------------------------------------------------------------- #
class EmbeddingService:
    """Thread-safe, lazily initialised embedding provider."""

    def __init__(self) -> None:
        self._encoder: (
            _SentenceTransformerEncoder
            | _HashingEncoder
            | None
        ) = None

        self._lock = threading.Lock()

        self._failed = False

        self._load_error: str | None = None

    # --------------------------------------------------------------------- #
    # Encoder lifecycle
    # --------------------------------------------------------------------- #

    @property
    def encoder(
        self,
    ) -> _SentenceTransformerEncoder | _HashingEncoder:
        """Return the lazily initialised encoder."""

        if self._encoder is None:
            with self._lock:
                if self._encoder is None:
                    self._encoder = self._build()

        return self._encoder

    def _build(
        self,
    ) -> _SentenceTransformerEncoder | _HashingEncoder:
        """Build the configured embedding backend."""

        # Read the backend from configuration.
        #
        # Render:
        #     EMBEDDING_BACKEND=hash
        #
        # Local:
        #     EMBEDDING_BACKEND=sentence-transformers
        backend = getattr(
            settings,
            "embedding_backend",
            "sentence-transformers",
        )

        backend = str(backend).lower().strip()

        # --------------------------------------------------------------- #
        # Lightweight mode
        # --------------------------------------------------------------- #

        if backend in {
            "hash",
            "fallback",
            "lightweight",
        }:
            logger.info(
                "Using lightweight hash embedding backend "
                "(EMBEDDING_BACKEND=%s)",
                backend,
            )

            return _HashingEncoder(
                settings.embedding_dim
            )

        # --------------------------------------------------------------- #
        # Sentence Transformer mode
        # --------------------------------------------------------------- #

        model_name = settings.embedding_model

        try:
            return _SentenceTransformerEncoder(
                model_name
            )

        except Exception as exc:  # noqa: BLE001
            # Sentence Transformers is optional.
            #
            # If the package is missing, the model cannot be downloaded,
            # or the model cannot be loaded, automatically fall back to
            # the deterministic hash encoder.

            self._failed = True

            self._load_error = (
                f"{type(exc).__name__}: {exc}"
            )

            logger.warning(
                "Sentence-Transformers could not be loaded (%s). "
                "Falling back to hashed n-gram embeddings.",
                self._load_error,
            )

            return _HashingEncoder(
                settings.embedding_dim
            )

    def warmup(self) -> None:
        """Force the embedding backend to load.

        This is useful for local development.

        Low-memory deployments such as Render should normally avoid
        calling this during application startup.
        """

        _ = self.encoder

    # --------------------------------------------------------------------- #
    # Properties
    # --------------------------------------------------------------------- #

    @property
    def dim(self) -> int:
        """Return embedding dimension."""
        return int(self.encoder.dim)

    @property
    def model_name(self) -> str:
        """Return the active embedding model name."""
        return self.encoder.model_name

    @property
    def backend_name(self) -> str:
        """Return the active embedding backend."""
        return self.encoder.name

    @property
    def is_fallback(self) -> bool:
        """Return True when the hash encoder is active."""
        return isinstance(
            self.encoder,
            _HashingEncoder,
        )

    @property
    def load_error(self) -> str | None:
        """Return the most recent model loading error."""
        return self._load_error

    # --------------------------------------------------------------------- #
    # Encoding API
    # --------------------------------------------------------------------- #

    def encode(
        self,
        texts: Sequence[str],
    ) -> np.ndarray:
        """Return an L2-normalised float32 matrix."""

        if not texts:
            return np.zeros(
                (0, self.dim),
                dtype=np.float32,
            )

        return np.asarray(
            self.encoder.encode(texts),
            dtype=np.float32,
        )

    def encode_one(
        self,
        text: str,
    ) -> np.ndarray:
        """Encode one text string."""

        return self.encode([text])[0]

    def cosine(
        self,
        a: np.ndarray,
        b: np.ndarray,
    ) -> float:
        """Calculate cosine similarity."""

        denom = float(
            np.linalg.norm(a)
            * np.linalg.norm(b)
        )

        if denom == 0.0:
            return 0.0

        return float(
            np.dot(a, b) / denom
        )

    def status(self) -> dict[str, object]:
        """Return encoder status for health/debug endpoints."""

        return {
            "model": self.model_name,
            "backend": self.backend_name,
            "dim": self.dim,
            "loaded": self._encoder is not None,
            "is_fallback": self.is_fallback,
            "load_error": self.load_error,
        }


embedding_service = EmbeddingService()


# --------------------------------------------------------------------------- #
# Text utilities used by the recommendation engine
# --------------------------------------------------------------------------- #

def normalize_space(
    text: str | None,
) -> str:
    """Normalise whitespace."""

    if not text:
        return ""

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def compose_standard_document(
    *,
    title: str,
    sector: str | None = None,
    category: str | None = None,
    product: str | None = None,
    scope: str | None = None,
    description: str | None = None,
    keywords: Sequence[str] | str | None = None,
    requirements: Sequence[str] | str | None = None,
) -> str:
    """Build the single text blob representing a standard."""

    if isinstance(keywords, str):
        keywords = [
            keyword.strip()
            for keyword in re.split(
                r"[;,|]",
                keywords,
            )
            if keyword.strip()
        ]

    if isinstance(requirements, str):
        requirements = [
            requirement.strip()
            for requirement in re.split(
                r"[;\n]",
                requirements,
            )
            if requirement.strip()
        ]

    parts: list[str] = [
        normalize_space(title),
        (
            f"Sector: {normalize_space(sector)}"
            if sector
            else ""
        ),
        (
            f"Category: {normalize_space(category)}"
            if category
            else ""
        ),
        (
            f"Product: {normalize_space(product)}"
            if product
            else ""
        ),
        normalize_space(scope),
        normalize_space(description),
        (
            "Keywords: " + ", ".join(keywords)
            if keywords
            else ""
        ),
        (
            "Requirements: " + "; ".join(requirements)
            if requirements
            else ""
        ),
    ]

    return " . ".join(
        part
        for part in parts
        if part
    )


def compose_query_document(
    *,
    specification: str,
    product: str | None = None,
    material: str | None = None,
    application: str | None = None,
    sector: str | None = None,
    requirements: Sequence[str] | None = None,
    keywords: Sequence[str] | None = None,
) -> str:
    """Build the query-side text blob."""

    parts: list[str] = [
        normalize_space(specification),
        (
            f"Product: {normalize_space(product)}"
            if product
            else ""
        ),
        (
            f"Material: {normalize_space(material)}"
            if material
            else ""
        ),
        (
            f"Application: {normalize_space(application)}"
            if application
            else ""
        ),
        (
            f"Sector: {normalize_space(sector)}"
            if sector
            else ""
        ),
        (
            "Requirements: " + "; ".join(requirements)
            if requirements
            else ""
        ),
        (
            "Keywords: " + ", ".join(keywords)
            if keywords
            else ""
        ),
    ]

    return " . ".join(
        part
        for part in parts
        if part
    )


def jaccard(
    a: set[str],
    b: set[str],
) -> float:
    """Calculate Jaccard similarity."""

    if not a or not b:
        return 0.0

    intersection = len(a & b)

    union = len(a | b)

    return (
        intersection / union
        if union
        else 0.0
    )


def coverage(
    query_tokens: set[str],
    document_tokens: set[str],
) -> float:
    """Return the fraction of query tokens present in the document."""

    if not query_tokens:
        return 0.0

    return (
        len(query_tokens & document_tokens)
        / len(query_tokens)
    )


def term_overlap_score(
    query_text: str,
    document_text: str,
    *,
    stem: bool = True,
) -> tuple[float, list[str]]:
    """Return token-overlap score and matched tokens."""

    q_tokens = tokenize(query_text)

    d_tokens = tokenize(document_text)

    if not q_tokens or not d_tokens:
        return 0.0, []

    def key(token: str) -> str:
        if (
            stem
            and len(token) > 4
            and token.endswith("s")
        ):
            return token[:-1]

        return token

    q_map: dict[str, str] = {}

    for token in q_tokens:
        q_map.setdefault(
            key(token),
            token,
        )

    d_map: dict[str, str] = {}

    for token in d_tokens:
        d_map.setdefault(
            key(token),
            token,
        )

    shared = sorted(
        set(q_map) & set(d_map)
    )

    if not shared:
        return 0.0, []

    j = jaccard(
        set(q_map),
        set(d_map),
    )

    c = coverage(
        set(q_map),
        set(d_map),
    )

    # Geometric blend prevents a single matching token
    # from producing an unrealistically high score.
    score = math.sqrt(
        max(0.0, j)
        * max(0.0, c)
    )

    matched = [
        q_map[key_name]
        for key_name in shared[:12]
    ]

    return min(1.0, score), matched