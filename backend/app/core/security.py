"""Security helpers.

The prototype runs in *authentication-ready* mode: every persisted row carries a
``user_id`` and every query is scoped by it, but no login is enforced by default
so the demo can be judged immediately. Flip ``AUTH_REQUIRED=true`` in
``backend/.env`` and supply an ``X-User-Id``/``X-User-Email`` header (or wire a
real IdP in front) and the API starts rejecting anonymous writes.

Password hashing uses PBKDF2-HMAC-SHA256 from the standard library, so no extra
native dependency (bcrypt/argon2) is required.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_PBKDF2_ROUNDS = 240_000
_ALGO = "pbkdf2_sha256"


# --------------------------------------------------------------------------- #
# Password hashing (standard library only)
# --------------------------------------------------------------------------- #
def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return f"{_ALGO}${_PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algo, rounds_s, salt_hex, digest_hex = encoded.split("$")
        if algo != _ALGO:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds_s)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


# --------------------------------------------------------------------------- #
# Header based "current user" resolution (demo / integration seam)
# --------------------------------------------------------------------------- #
def resolve_user_id(headers: dict[str, Any]) -> int | None:
    """Return the acting user id from request headers, or ``None``.

    ``X-User-Id`` is trusted only when it is a plain positive integer. The
    prototype intentionally performs no cryptographic token validation here -
    document that clearly before exposing this service publicly.
    """
    raw = headers.get("x-user-id")
    if raw is None:
        return None
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        logger.warning("Ignoring malformed X-User-Id header: %r", raw)
        return None
    return value if value > 0 else None


def resolve_user_email(headers: dict[str, Any]) -> str | None:
    raw = headers.get("x-user-email")
    if not raw:
        return None
    value = str(raw).strip()
    return value or None


def auth_is_required() -> bool:
    return bool(getattr(settings, "auth_required", False))


def signing_secret() -> str:
    """Secret used for internal integrity checks. Never logged, never returned."""
    return settings.secret_key
