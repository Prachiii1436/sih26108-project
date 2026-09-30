"""Applicability demonstrator routes (Steps 1-10 of the SIH26108 workflow).

    POST /api/applicability/analyze   - extract requirements, find candidates,
                                        run the applicability check, explain it
    POST /api/applicability/upload    - extract text from an uploaded PDF/DOCX/TXT
    GET  /api/applicability/knowledge-base - browse the curated prototype KB
    POST /api/applicability/review    - officer accepts / rejects / modifies
    GET  /api/applicability/reviews   - stored officer decisions (SQLite)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.deps import CurrentUser
from app.core.logging import get_logger
from app.schemas.applicability import (
    ApplicabilityAnalyzeRequest,
    ApplicabilityResponse,
    KnowledgeBaseInfo,
    ReviewCreate,
    ReviewOut,
    UploadResponse,
)
from app.services import applicability as engine
from app.services import prototype_store

logger = get_logger(__name__)

router = APIRouter(prefix="/applicability", tags=["applicability"])

MAX_FILE_CHARS = 40_000
TEXT_SUFFIXES = (".txt", ".md", ".csv", ".text", ".rtf")
DOCX_SUFFIX = ".docx"


def _read_docx(data: bytes) -> str:
    """Extract the visible text of a .docx file using the standard library only.

    ``.docx`` is a ZIP container holding ``word/document.xml``. Parsing it with
    :mod:`zipfile` avoids adding a python-docx dependency for a prototype.
    """
    import html as html_module
    import io
    import re
    import zipfile

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", "ignore")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise HTTPException(status_code=422, detail="Could not read the .docx file.") from exc

    xml = re.sub(r"</w:p\s*>", "\n", xml)
    xml = re.sub(r"<w:tab[^>]*/>", " ", xml)
    xml = re.sub(r"<w:br[^>]*/>", "\n", xml)
    return html_module.unescape(re.sub(r"<[^>]+>", "", xml))


@router.post(
    "/analyze",
    response_model=ApplicabilityResponse,
    summary="Extract requirements, retrieve candidates and check applicability",
)
def analyze(payload: ApplicabilityAnalyzeRequest, user: CurrentUser) -> ApplicabilityResponse:
    """Runs Steps 2-6: extraction -> candidate search -> applicability check."""
    combined = payload.specification
    if payload.file_text:
        combined = f"{combined}\n{payload.file_text}".strip()

    result = engine.analyze(
        specification=combined,
        technical_requirements=payload.technical_requirements or "",
        product_name=payload.product_name or "",
        requirements=payload.requirements,
        top_k=payload.top_k or 8,
    )
    logger.info(
        "POST /applicability/analyze (%s) -> %d candidate(s), %d clarification(s) in %.0f ms",
        payload.stage,
        len(result["candidates"]),
        len(result["clarifications"]),
        result["processing_ms"],
    )
    return ApplicabilityResponse(**result)


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Extract text from an uploaded PDF/DOCX/TXT tender document",
)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    """PyMuPDF for PDFs; plain decoding for text documents."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    filename = file.filename or "document"
    lower = filename.lower()
    pages: int | None = None
    text = ""

    if lower.endswith(".pdf"):
        try:
            import pymupdf  # PyMuPDF
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise HTTPException(
                status_code=501,
                detail="PyMuPDF is not installed - run: pip install pymupdf",
            ) from exc
        try:
            document = pymupdf.open(stream=data, filetype="pdf")
        except Exception as exc:  # noqa: BLE001 - surface a readable error
            raise HTTPException(
                status_code=422, detail=f"Could not read the PDF: {exc}"
            ) from exc
        pages = document.page_count
        text = "\n".join(page.get_text() for page in document)
        document.close()
    elif lower.endswith(DOCX_SUFFIX) or (file.content_type or "").endswith(
        "wordprocessingml.document"
    ):
        text = _read_docx(data)
    elif lower.endswith(DOCX_SUFFIX):
        text = _read_docx(data)
    elif lower.endswith(TEXT_SUFFIXES) or (file.content_type or "").startswith("text/"):
        for encoding in ("utf-8", "utf-16", "latin-1"):
            try:
                text = data.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if not text:
            raise HTTPException(status_code=422, detail="Could not decode the text file.")
    else:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type - upload a PDF, DOCX or plain text (.txt) document.",
        )

    cleaned = " ".join(text.split())
    truncated = len(cleaned) > MAX_FILE_CHARS
    if truncated:
        cleaned = cleaned[:MAX_FILE_CHARS]

    return UploadResponse(
        filename=filename,
        content_type=file.content_type or "",
        chars=len(cleaned),
        pages=pages,
        truncated=truncated,
        text=cleaned,
        message=(
            f"Extracted {len(cleaned):,} characters"
            + (f" from {pages} page(s)" if pages else "")
            + (" (truncated)" if truncated else "")
            + "."
        ),
    )


@router.get(
    "/knowledge-base",
    summary="Browse the curated Prototype Standards Knowledge Base",
)
def knowledge_base() -> dict[str, Any]:
    meta = prototype_store.knowledge_base_meta()
    info = KnowledgeBaseInfo(**meta)
    records = []
    for record in prototype_store.load_knowledge_base():
        records.append(
            {
                "id": record["id"],
                "is_number": record["is_number"],
                "edition": record["edition"],
                "title": record["title"],
                "status": record["status"],
                "status_label": record.get("status_label", ""),
                "sector": record.get("sector", ""),
                "category": record.get("category", ""),
                "product_family": record.get("product_family", ""),
                "product_types": record.get("product_types", []),
                "scope": record.get("scope", ""),
                "year": record.get("year"),
                "conditions": [
                    {
                        "dimension": c["dimension"],
                        "label": c["label"],
                        "clause": c.get("clause"),
                        "critical": c.get("critical", True),
                        "text": c.get("text"),
                    }
                    for c in record.get("conditions", [])
                ],
                "exclusions": record.get("exclusions", []),
                "versions": record.get("versions", []),
                "related": record.get("related", []),
                "evidence": record.get("evidence", []),
            }
        )
    return {
        "knowledge_base": info.model_dump(),
        "notice": meta.get("notice", ""),
        "disclaimer": engine.DISCLAIMER,
        "ui_message": engine.UI_MESSAGE,
        "standards": records,
    }


@router.post(
    "/review",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record the officer's accept / reject / modify decision",
)
def review(payload: ReviewCreate, user: CurrentUser) -> dict[str, Any]:
    row_id = prototype_store.save_review(
        {
            "user_id": payload.user_id or (str(user) if user else None),
            "specification": payload.specification,
            "requirements": payload.requirements,
            "kb_id": payload.standard_id,
            "is_number": payload.is_number,
            "edition": payload.edition,
            "reported_status": payload.reported_status,
            "decision": payload.decision,
            "note": payload.note,
        }
    )
    logger.info(
        "POST /applicability/review -> %s %s = %s (row %d)",
        payload.is_number,
        payload.edition,
        payload.decision,
        row_id,
    )
    stored = next((r for r in prototype_store.list_reviews(limit=200) if r["id"] == row_id), None)
    if stored is None:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail="Review could not be read back.")
    return stored


@router.get("/reviews", response_model=list[ReviewOut], summary="Stored officer decisions")
def reviews(limit: int = 50) -> list[dict[str, Any]]:
    return prototype_store.list_reviews(limit=max(1, min(limit, 200)))


__all__ = ["router"]
