"""Application settings loaded from environment variables / ``backend/.env``.

No credentials are hard-coded. Everything sensitive lives in ``backend/.env``
(never committed - see ``.gitignore``) and is exposed to the app through
``app.core.config.settings``.

XAMPP note: MySQL is expected on ``127.0.0.1:3307`` (not the default 3306).
If ``DATABASE_URL`` is left empty it is assembled from the ``MYSQL_*`` parts.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

try:  # python-dotenv is listed in requirements.txt
    from dotenv import load_dotenv

    _HAS_DOTENV = True
except ImportError:  # pragma: no cover - fallback parser
    _HAS_DOTENV = False

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_VAR_DIR = BACKEND_DIR / "var"


def _read_env_file(path: Path) -> dict[str, str]:
    """Minimal ``KEY=VALUE`` parser used when python-dotenv is unavailable."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


def load_environment() -> None:
    """Load ``backend/.env`` into ``os.environ`` without clobbering real vars."""
    if _HAS_DOTENV:
        load_dotenv(dotenv_path=ENV_FILE, override=False)
        return
    for key, value in _read_env_file(ENV_FILE).items():
        os.environ.setdefault(key, value)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _env_int(key: str, default: int) -> int:
    raw = _env(key)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    raw = _env(key)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _env_bool(key: str, default: bool = False) -> bool:
    raw = _env(key).lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_list(key: str, default: list[str] | None = None) -> list[str]:
    raw = _env(key)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.replace(";", ",").split(",") if item.strip()]


def _env_weights(key: str, default: dict[str, float]) -> dict[str, float]:
    """Parse ``"semantic=0.4,keyword=0.15,..."`` into a normalised dict."""
    raw = _env(key)
    if not raw:
        return dict(default)
    parsed: dict[str, float] = {}
    for chunk in raw.split(","):
        if "=" not in chunk:
            continue
        name, _, value = chunk.partition("=")
        try:
            parsed[name.strip()] = float(value)
        except ValueError:
            continue
    if not parsed:
        return dict(default)
    total = sum(abs(v) for v in parsed.values()) or 1.0
    return {name: value / total for name, value in parsed.items()}


DEFAULT_WEIGHTS: dict[str, float] = {
    "semantic": 0.40,
    "keyword": 0.15,
    "product": 0.15,
    "requirement": 0.15,
    "sector": 0.10,
    "application": 0.05,
}


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of the runtime configuration."""

    # --- application -------------------------------------------------------
    app_name: str
    app_env: str
    app_version: str
    debug: bool
    secret_key: str
    api_prefix: str

    # --- database (XAMPP MySQL, default port 3307) -------------------------
    mysql_host: str
    mysql_port: int
    mysql_database: str
    mysql_user: str
    mysql_password: str
    mysql_charset: str
    database_url: str
    db_pool_size: int
    db_max_overflow: int
    db_pool_recycle: int
    db_connect_timeout: int

    # --- AI / NLP ----------------------------------------------------------
    ai_provider: str
    ai_api_key: str
    ai_api_base: str
    ai_model: str
    embedding_model: str
    embedding_dim: int
    vector_backend: str
    vector_index_path: str
    index_auto_build: bool

    # --- recommendation engine --------------------------------------------
    weights: dict[str, float]
    min_specification_length: int
    max_specification_length: int
    default_top_k: int
    max_top_k: int
    min_relevance: float
    semantic_candidate_multiplier: int
    candidate_pool: int

    # --- misc --------------------------------------------------------------
    log_level: str
    var_dir: str
    demo_mode: bool
    auth_required: bool
    cors_origins: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------
    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def server_version(self) -> str:
        return f"{self.app_name} {self.app_version} ({self.app_env})"

    def safe_database_target(self) -> str:
        """Log/display friendly DB description - never leaks the password."""
        return f"mysql://{self.mysql_user}@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"

    def public_dict(self) -> dict[str, Any]:
        """Configuration safe to expose through ``/api/health``."""
        return {
            "app_name": self.app_name,
            "app_env": self.app_env,
            "version": self.app_version,
            "database_target": self.safe_database_target(),
            "mysql_port": self.mysql_port,
            "embedding_model": self.embedding_model,
            "vector_backend": self.vector_backend,
            "ai_provider": self.ai_provider or "local-embeddings",
            "weights": self.weights,
            "min_relevance": self.min_relevance,
            "auth_required": self.auth_required,
            "demo_mode": self.demo_mode,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Build (and cache) the settings object."""
    load_environment()

    mysql_host = _env("MYSQL_HOST", "127.0.0.1")
    mysql_port = _env_int("MYSQL_PORT", 3307)
    mysql_database = _env("MYSQL_DATABASE", "sih26108")
    mysql_user = _env("MYSQL_USER", "root")
    mysql_password = _env("MYSQL_PASSWORD", "")
    mysql_charset = _env("MYSQL_CHARSET", "utf8mb4")

    database_url = _env("DATABASE_URL")
    if not database_url:
        password = mysql_password.replace("@", "%40").replace(":", "%3A")
        database_url = (
            f"mysql+pymysql://{mysql_user}:{password}@{mysql_host}:{mysql_port}"
            f"/{mysql_database}?charset={mysql_charset}"
        )

    var_dir = _env("VAR_DIR", str(DEFAULT_VAR_DIR))
    try:
        Path(var_dir).mkdir(parents=True, exist_ok=True)
    except OSError:  # pragma: no cover - read-only deployments
        var_dir = str(DEFAULT_VAR_DIR)

    # Relative VECTOR_INDEX_PATH values are resolved against the backend folder so
    # the app behaves the same whether it is started from backend/ or the repo root.
    index_path_raw = _env("VECTOR_INDEX_PATH", str(Path(var_dir) / "standards.faiss"))
    index_path = Path(index_path_raw)
    if not index_path.is_absolute():
        index_path = (BACKEND_DIR / index_path).resolve()

    return Settings(
        app_name=_env("APP_NAME", "SIH26108"),
        app_env=_env("APP_ENV", "development"),
        app_version=_env("APP_VERSION", "1.0.0"),
        debug=_env_bool("DEBUG", False),
        secret_key=_env("SECRET_KEY", "change_this_in_production"),
        api_prefix=_env("API_PREFIX", "/api"),
        cors_origins=_env_list(
            "CORS_ORIGINS",
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:4173",
                "http://127.0.0.1:4173",
                "http://localhost",
                "http://127.0.0.1",
            ],
        ),
        mysql_host=mysql_host,
        mysql_port=mysql_port,
        mysql_database=mysql_database,
        mysql_user=mysql_user,
        mysql_password=mysql_password,
        mysql_charset=mysql_charset,
        database_url=database_url,
        db_pool_size=_env_int("DB_POOL_SIZE", 5),
        db_max_overflow=_env_int("DB_MAX_OVERFLOW", 10),
        db_pool_recycle=_env_int("DB_POOL_REYCLE", 1800),
        db_connect_timeout=_env_int("DB_CONNECT_TIMEOUT", 8),
        ai_provider=_env("AI_PROVIDER"),
        ai_api_key=_env("AI_API_KEY"),
        ai_api_base=_env("AI_API_BASE", "https://api.openai.com/v1"),
        ai_model=_env("AI_MODEL", "gpt-4o-mini"),
        embedding_model=_env("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        embedding_dim=_env_int("EMBEDDING_DIM", 384),
        vector_backend=_env("VECTOR_BACKEND", "auto").lower(),
        vector_index_path=str(index_path),
        index_auto_build=_env_bool("INDEX_AUTO_BUILD", True),
        weights=_env_weights("RECOMMENDATION_WEIGHTS", DEFAULT_WEIGHTS),
        min_specification_length=_env_int("MIN_SPECIFICATION_LENGTH", 15),
        max_specification_length=_env_int("MAX_SPECIFICATION_LENGTH", 20000),
        default_top_k=_env_int("TOP_K", 5),
        max_top_k=_env_int("MAX_TOP_K", 25),
        min_relevance=_env_float("MIN_RELEVANCE", 30.0),
        semantic_candidate_multiplier=_env_int("SEMANTIC_CANDIDATE_MULTIPLIER", 4),
        candidate_pool=_env_int("CANDIDATE_POOL", 40),
        log_level=_env("LOG_LEVEL", "INFO").upper(),
        var_dir=var_dir,
        demo_mode=_env_bool("DEMO_MODE", True),
        auth_required=_env_bool("AUTH_REQUIRED", False),
    )


settings = get_settings()
