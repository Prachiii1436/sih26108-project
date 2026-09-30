"""Vector search layer.

Two interchangeable backends behind one interface:

``faiss``
    In-process ``IndexFlatIP`` over L2-normalised embeddings (cosine == inner
    product). Rebuilt from the ``standards.embedding`` column whenever the MySQL
    data changes, then persisted to ``backend/var/standards.faiss``.

``mysql``
    Pure-SQL fallback: pulls the JSON embedding column into a numpy matrix and
    does the same cosine search. Slower but has zero native dependencies, so the
    app still works if FAISS cannot be installed.

Selecting a backend is a config change (``VECTOR_BACKEND=auto|faiss|mysql``) - the
rest of the application only ever talks to :class:`VectorStore`.
"""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.embeddings import compose_standard_document, embedding_service
from app.models import EngineState, Standard

logger = get_logger(__name__)

try:  # pragma: no cover - import guard
    import faiss  # type: ignore

    _HAS_FAISS = True
except Exception:  # pragma: no cover
    faiss = None  # type: ignore
    _HAS_FAISS = False

STATE_ROW_IDS = "vector_index"
STATE_ROW_MODEL = "vector_index_model"
STATE_ROW_BUILT = "vector_index_built_at"


@dataclass(slots=True)
class VectorHit:
    standard_id: int
    score: float  # cosine similarity in [-1, 1]


class VectorStore:
    """Thread-safe façade over the selected vector backend."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ids: list[int] = []
        self._matrix: np.ndarray | None = None  # mysql backend
        self._index: Any = None  # faiss backend
        self._dim: int = 0
        self._backend: str = "empty"
        self._built_at: str | None = None
        self._loaded = False
        # Guards the *whole* load/build sequence. Must be re-entrant because
        # ensure_ready() -> build_from_database() nest these acquisitions.
        self._lock_ = threading.RLock()

    # ------------------------------------------------------------------ #
    #  Introspection
    # ------------------------------------------------------------------ #
    @property
    def backend(self) -> str:
        return self._backend

    @property
    def size(self) -> int:
        return len(self._ids)

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def built_at(self) -> str | None:
        return self._built_at

    @property
    def is_ready(self) -> bool:
        return bool(self._ids) and self._dim > 0

    def status(self) -> dict[str, Any]:
        return {
            "backend": self._backend,
            "size": self.size,
            "dim": self._dim,
            "built_at": self._built_at,
            "faiss_available": _HAS_FAISS,
            "is_ready": self.is_ready,
        }

    # ------------------------------------------------------------------ #
    #  Building
    # ------------------------------------------------------------------ #
    def _pick_backend(self) -> str:
        requested = settings.vector_backend
        if requested == "faiss":
            return "faiss" if _HAS_FAISS else "mysql"
        if requested == "mysql":
            return "mysql"
        return "faiss" if _HAS_FAISS else "mysql"

    def build_from_database(self, session: Session, *, force: bool = False) -> dict[str, Any]:
        """(Re)build the index from ``standards.embedding``.

        Standards whose embedding is missing (or was produced by a different
        model) are re-encoded on the fly, so the index is always consistent.
        """
        with self._lock_:
            rows = session.execute(
                select(
                    Standard.id,
                    Standard.title,
                    Standard.sector,
                    Standard.category,
                    Standard.product,
                    Standard.scope,
                    Standard.description,
                    Standard.keywords,
                    Standard.requirements,
                    Standard.embedding,
                    Standard.embedding_model,
                ).order_by(Standard.id)
            ).all()
            if not rows:
                self._clear()
                return {"status": "empty", "size": 0}

            model_name = embedding_service.model_name
            vectors: list[np.ndarray] = []
            ids: list[int] = []
            missing = 0
            re_encoded: list[tuple[int, list[float], int]] = []

            for row in rows:
                vec = self._decode(row.embedding)
                if vec is None or row.embedding_model != model_name or vec.shape[0] != embedding_service.dim:
                    missing += 1
                    document = compose_standard_document(
                        title=row.title,
                        sector=row.sector,
                        category=row.category,
                        product=row.product,
                        scope=row.scope,
                        description=row.description,
                        keywords=row.keywords,
                        requirements=row.requirements,
                    )
                    vec = embedding_service.encode_one(document)
                    re_encoded.append((row.id, [float(x) for x in vec], int(vec.shape[0])))
                vectors.append(vec)
                ids.append(int(row.id))

            matrix = np.vstack(vectors).astype(np.float32)
            self._install(matrix, ids)

            if re_encoded:
                now = time.strftime("%Y-%m-%d %H:%M:%S")
                for standard_id, payload, dim in re_encoded:
                    session.execute(
                        update(Standard)
                        .where(Standard.id == standard_id)
                        .values(
                            embedding=json.dumps(payload),
                            embedding_model=model_name,
                            embedding_dim=dim,
                            embedding_updated_at=func.now(),
                        )
                    )
                logger.info("Persisted %d freshly computed embeddings", len(re_encoded))

            self._persist_state(session, len(ids))
            return {
                "status": "rebuilt" if force else "built",
                "size": len(ids),
                "backend": self._backend,
                "encoded_on_the_fly": missing,
            }

    def _install(self, matrix: np.ndarray, ids: list[int]) -> None:
        dim = int(matrix.shape[1])
        backend = self._pick_backend()
        with self._lock:
            self._matrix = matrix
            self._ids = ids
            self._dim = dim
            self._backend = backend
            self._built_at = time.strftime("%Y-%m-%d %H:%M:%S")
            if backend == "faiss":
                index = faiss.IndexFlatIP(dim)
                index.add(matrix)
                self._index = index
            else:
                self._index = None
            self._loaded = True
        if backend == "faiss":
            self._persist_to_disk(matrix, ids)
        logger.info(
            "Vector index ready: backend=%s size=%d dim=%d", backend, len(ids), dim
        )

    def _clear(self) -> None:
        with self._lock:
            self._ids = []
            self._matrix = None
            self._index = None
            self._dim = 0
            self._backend = "empty"
            self._built_at = None
            self._loaded = True

    def _persist_state(self, session: Session, size: int) -> None:
        rows = {
            STATE_ROW_IDS: json.dumps(self._ids),
            STATE_ROW_MODEL: embedding_service.model_name,
            STATE_ROW_BUILT: self._built_at or "",
        }
        for key, value in rows.items():
            existing = session.get(EngineState, key)
            if existing:
                existing.value = value
            else:
                session.add(EngineState(key=key, value=value))
        session.flush()

    # ------------------------------------------------------------------ #
    #  Disk persistence (FAISS)
    # ------------------------------------------------------------------ #
    def _index_paths(self) -> tuple[Path, Path]:
        base = Path(settings.vector_index_path)
        return base, base.with_suffix(".ids.json")

    def _persist_to_disk(self, matrix: np.ndarray, ids: list[int]) -> None:
        if self._backend != "faiss" or self._index is None:
            return
        index_path, ids_path = self._index_paths()
        try:
            index_path.parent.mkdir(parents=True, exist_ok=True)
            faiss.write_index(self._index, str(index_path))
            ids_path.write_text(json.dumps(ids), encoding="utf-8")
        except Exception as exc:  # noqa: BLE001 - disk issues must not be fatal
            logger.warning("Could not persist FAISS index to disk: %s", exc)

    def _load_from_disk(self) -> bool:
        # Resolve the backend from config rather than reading self._backend:
        # on a cold start that attribute is still "empty", which would make this
        # method bail out and needlessly rebuild the index from MySQL.
        if not _HAS_FAISS or self._pick_backend() != "faiss":
            return False
        index_path, ids_path = self._index_paths()
        if not (index_path.is_file() and ids_path.is_file()):
            return False
        try:
            index = faiss.read_index(str(index_path))
            ids = json.loads(ids_path.read_text(encoding="utf-8"))
            if index.ntotal != len(ids):
                return False
            with self._lock:
                self._index = index
                self._ids = [int(i) for i in ids]
                self._dim = int(index.d)
                # Must promote the backend here: search() and _ensure_matrix()
                # both branch on it, and on a cold start it is still "empty".
                # Leaving it unset made every semantic search return no hits and
                # silently degraded ranking to a full-table scan.
                self._backend = "faiss"
                try:
                    self._built_at = time.strftime(
                        "%Y-%m-%d %H:%M:%S", time.localtime(index_path.stat().st_mtime)
                    )
                except OSError:
                    self._built_at = None
                self._loaded = True
            logger.info("Loaded FAISS index from disk (%d vectors)", len(ids))
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load FAISS index from disk: %s", exc)
            return False

    # ------------------------------------------------------------------ #
    #  Loading / readiness
    # ------------------------------------------------------------------ #
    def ensure_ready(self, session: Session) -> None:
        """Guarantee the index is loaded before a query runs."""
        with self._lock_:
            if self.is_ready:
                return
            if not self._loaded and self._load_from_disk():
                return
            self.build_from_database(session)

    def invalidate(self) -> None:
        """Mark the in-memory index stale (called after bulk imports)."""
        with self._lock:
            self._loaded = False
            self._ids = []
            self._matrix = None
            self._index = None
            self._dim = 0
            self._built_at = None
            self._backend = "empty"

    # ------------------------------------------------------------------ #
    #  Search
    # ------------------------------------------------------------------ #
    def search(self, vector: np.ndarray, top_k: int = 40) -> list[VectorHit]:
        """Cosine-similarity search. Returns hits sorted best-first."""
        query = np.asarray(vector, dtype=np.float32).reshape(1, -1)
        if query.shape[1] != self._dim:
            # Model changed under us - the caller must rebuild.
            return []
        limit = max(1, min(int(top_k), len(self._ids)))

        if self._backend == "faiss" and self._index is not None:
            with self._lock:
                scores, positions = self._index.search(query, limit)
            hits: list[VectorHit] = []
            for score, position in zip(scores[0].tolist(), positions[0].tolist()):
                if position < 0 or position >= len(self._ids):
                    continue
                hits.append(VectorHit(self._ids[position], float(score)))
            return hits

        with self._lock:
            if self._matrix is None or self._matrix.size == 0:
                return []
            scores = self._matrix @ query[0]
            if limit >= len(self._ids):
                order = np.argsort(-scores)
            else:
                order = np.argpartition(-scores, limit - 1)[:limit]
                order = order[np.argsort(-scores[order])]
            return [VectorHit(self._ids[int(i)], float(scores[int(i)])) for i in order]

    def search_batch(
        self, vectors: Sequence[np.ndarray], top_k: int = 40
    ) -> list[list[VectorHit]]:
        return [self.search(v, top_k) for v in vectors]

    def similarity_between(self, standard_ids: Sequence[int]) -> dict[tuple[int, int], float]:
        """Cosine similarity between the stored vectors of the given ids."""
        self._ensure_matrix()
        with self._lock:
            if self._matrix is None:
                return {}
            position = {sid: i for i, sid in enumerate(self._ids)}
            pairs: dict[tuple[int, int], float] = {}
            ids = [i for i in standard_ids if i in position]
            for i, a in enumerate(ids):
                for b in ids[i + 1 :]:
                    va = self._matrix[position[a]]
                    vb = self._matrix[position[b]]
                    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
                    value = float(np.dot(va, vb) / denom) if denom else 0.0
                    pairs[(a, b)] = max(0.0, min(1.0, value))
            return pairs

    def _ensure_matrix(self) -> None:
        if self._matrix is not None:
            return
        if self._backend == "faiss" and self._index is not None:
            with self._lock:
                try:
                    self._matrix = np.asarray(self._index.reconstruct_n(0, self._index.ntotal))
                    return
                except Exception as exc:  # noqa: BLE001
                    logger.debug("FAISS reconstruct unavailable: %s", exc)
        self._load_from_disk()

    # ------------------------------------------------------------------ #
    @staticmethod
    def _decode(payload: str | None) -> np.ndarray | None:
        if not payload:
            return None
        try:
            data = json.loads(payload)
        except (TypeError, ValueError):
            return None
        if not isinstance(data, list) or not data:
            return None
        return np.asarray(data, dtype=np.float32)


vector_store = VectorStore()
