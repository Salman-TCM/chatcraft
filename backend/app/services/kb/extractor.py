"""
Text extraction for each supported document type.
All functions return raw text; cleaning is handled downstream.
"""
import io
import tempfile

import httpx
from bs4 import BeautifulSoup
from loguru import logger


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def extract_pdf(data: bytes) -> str:
    """pdfplumber first; fall back to PyMuPDF if extraction is empty."""
    import pdfplumber

    text_parts: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        text = "\n\n".join(text_parts).strip()
        if text:
            return text
    except Exception as exc:
        logger.warning(f"pdfplumber failed: {exc!r}, trying PyMuPDF")

    # PyMuPDF fallback
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    for page in doc:
        text_parts.append(page.get_text())
    return "\n\n".join(text_parts).strip()


def extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


async def extract_url(url: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(
            url,
            headers={"User-Agent": "ChatCraftBot/1.0 (+https://chatcraft.ai)"},
        )
        resp.raise_for_status()
        html = resp.text

    soup = BeautifulSoup(html, "lxml")

    # Remove boilerplate tags
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
        tag.decompose()

    # Prefer main content element if present
    main = soup.find("main") or soup.find("article") or soup.body
    if not main:
        return soup.get_text(separator="\n")

    return main.get_text(separator="\n")


async def extract_text_for_document(doc_type: str, file_url: str | None, source_url: str | None, raw_content: str | None) -> str:
    """
    Dispatch to the right extractor based on document type.
    Returns raw extracted text.
    """
    if doc_type == "text":
        return raw_content or ""

    if doc_type == "url":
        return await extract_url(source_url or file_url or "")

    # Remaining types require file bytes
    if not file_url:
        raise ValueError(f"file_url required for document type '{doc_type}'")

    data = await _download_bytes(file_url)

    if doc_type == "pdf":
        return extract_pdf(data)
    if doc_type == "docx":
        return extract_docx(data)
    if doc_type == "txt":
        return extract_txt(data)

    raise ValueError(f"Unsupported document type: {doc_type}")
