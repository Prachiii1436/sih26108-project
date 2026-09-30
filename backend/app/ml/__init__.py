"""Machine-learning layer: embeddings + vector search."""

from app.ml.embeddings import (  # noqa: F401
    compose_query_document,
    compose_standard_document,
    embedding_service,
    normalize_space,
    term_overlap_score,
    tokenize,
)
from app.ml.vector_store import VectorHit, VectorStore, vector_store  # noqa: F401
