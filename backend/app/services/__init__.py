"""Service layer: NLP extraction, recommendation engine, persistence helpers."""

from app.services.analysis import (  # noqa: F401
    DISCLAIMER,
    NO_MATCH_MESSAGE,
    analyze,
    rebuild_index,
    rescore,
    run_extraction,
)
from app.services.analytics import build_analytics  # noqa: F401
from app.services.nlp import extract_requirements, normalize_text, segment_clauses  # noqa: F401
from app.services.recommendation import (  # noqa: F401
    RecommendationEngine,
    engine,
    relevance_label,
)
from app.services.saved import (  # noqa: F401
    delete_saved,
    get_saved,
    list_saved,
    save_standard,
    saved_ids,
    update_saved,
)
from app.services.standards import (  # noqa: F401
    compare_standards,
    get_facets,
    get_standard,
    list_standards,
    load_summaries,
)
from app.services.history import (  # noqa: F401
    create_history,
    delete_history,
    get_history_item,
    list_history,
    update_history,
)
