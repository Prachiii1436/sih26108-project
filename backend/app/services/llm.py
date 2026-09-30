"""Optional external LLM assistance.

``AI_PROVIDER`` is **empty by default**, and the whole recommendation pipeline is
fully functional without it: extraction is rule/lexicon based, embeddings are
local. When a provider *is* configured the LLM only refines the extracted
requirements and polishes the plain-language explanation - it never decides the
ranking, which stays deterministic and reproducible.
"""

from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger
from app.schemas.analysis import ExtractedRequirements

logger = get_logger(__name__)

_TIMEOUT_SECONDS = 25


class LLMUnavailable(RuntimeError):
    """Raised when the optional LLM path cannot be used."""


def _require_config() -> tuple[str, str, str]:
    provider = (settings.ai_provider or "").strip().lower()
    key = (settings.ai_api_key or "").strip()
    if not provider or not key:
        raise LLMUnavailable("AI_PROVIDER / AI_API_KEY not configured")
    return provider, key, settings.ai_api_base.rstrip("/")


def _chat(messages: list[dict[str, str]], *, max_tokens: int = 700) -> str:
    provider, key, base = _require_config()
    try:
        import requests
    except ImportError as exc:  # pragma: no cover
        raise LLMUnavailable("requests is not installed") from exc

    url = f"{base}/chat/completions"
    payload: dict[str, Any] = {
        "model": settings.ai_model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        return str(body["choices"][0]["message"]["content"])
    except Exception as exc:  # noqa: BLE001 - network/provider errors
        logger.warning("LLM call to %s failed: %s", provider, exc)
        raise ExternalServiceError(
            f"The configured AI provider ({provider}) could not be reached. "
            "The local pipeline was used instead."
        ) from exc


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        cleaned = cleaned[4:] if cleaned.lower().startswith("json") else cleaned
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise LLMUnavailable("LLM response was not valid JSON")
    return json.loads(cleaned[start : end + 1])


_SYSTEM_PROMPT = (
    "You are a procurement standards analyst for Indian government buying. "
    "You extract structured attributes from procurement specifications. "
    "Never invent Indian Standard numbers. Reply with JSON only."
)


def refine_extraction(
    specification: str, base: ExtractedRequirements
) -> ExtractedRequirements:
    """Refine the local extraction with an LLM (best-effort)."""
    user_prompt = (
        "Extract these fields from the procurement specification below.\n"
        "Fields: product, material, application, sector, requirements (array of short "
        "requirement phrases), keywords (array of search keywords).\n"
        "Rules: keep the wording close to the input, do not invent standard numbers, "
        "return an empty string/array when a field is not stated.\n\n"
        f"Specification:\n{specification[:4000]}\n\n"
        f"Local baseline (may be refined): {base.model_dump_json()}\n"
    )
    content = _chat(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )
    data = _parse_json(content)
    return ExtractedRequirements(
        product=(data.get("product") or base.product) or None,
        material=(data.get("material") or base.material) or None,
        application=(data.get("application") or base.application) or None,
        sector=(data.get("sector") or base.sector) or None,
        category=base.category,
        quantity=base.quantity,
        requirements=list(data.get("requirements") or base.requirements)[:15],
        technical_requirements=base.technical_requirements,
        safety_requirements=base.safety_requirements,
        performance_requirements=base.performance_requirements,
        parameters=base.parameters,
        keywords=list(data.get("keywords") or base.keywords)[:25],
        confidence=base.confidence,
        source="hybrid",
        notes=base.notes,
    )


def polish_reason(reason: str, context: dict[str, Any]) -> str:
    """Optionally re-word an explanation in clearer procurement language."""
    try:
        content = _chat(
            [
                {
                    "role": "system",
                    "content": (
                        "Rewrite the supplied recommendation reason as one or two clear "
                        "sentences for a government procurement officer. Keep every number "
                        "unchanged. Do not add claims of certification or compliance. "
                        "Reply with the rewritten sentence only."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Reason: {reason}\nContext: {json.dumps(context)[:1200]}",
                },
            ],
            max_tokens=220,
        )
        cleaned = content.strip()
        return cleaned or reason
    except (LLMUnavailable, ExternalServiceError) as exc:
        logger.debug("Reason polishing skipped: %s", exc)
        return reason
