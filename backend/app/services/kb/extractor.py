"""
Text extraction for each supported document type.
All functions return raw text; cleaning is handled downstream.
"""

import asyncio
import io
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup
from loguru import logger

_MAX_REDIRECTS = 5


class UnsafeURLError(ValueError):
    """Raised when a user-supplied URL resolves to a non-public address."""


def _assert_public_host(hostname: str) -> None:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Could not resolve host: {hostname}") from exc
    for _family, _type, _proto, _canonname, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeURLError(f"URL resolves to a non-public address: {hostname} -> {ip}")


async def _assert_safe_url(url: str) -> None:
    """
    Block SSRF: reject non-http(s) schemes and any hostname that resolves to
    a private/loopback/link-local/reserved address (e.g. cloud metadata
    endpoints, internal services). Ingested URL content is stored and later
    surfaced back through chat search results, so an unguarded fetch here is
    a real data-exfiltration path, not just a theoretical one.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported URL scheme: {parts.scheme!r}")
    if not parts.hostname:
        raise UnsafeURLError("URL has no hostname")
    await asyncio.to_thread(_assert_public_host, parts.hostname)


async def _download_bytes(url: str) -> bytes:
    await _assert_safe_url(url)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


# Legacy Bengali word processors (Bijoy Classic, SutonnyMJ, and similar
# pre-Unicode fonts) don't use real Bengali code points — they remap Bengali
# glyphs onto ordinary Latin-1/Windows-1252 slots. Extracted text from a PDF
# built with one of these fonts therefore comes out as this exact byte
# sequence, which happens to be near-valid Windows-1252 text, not Bengali
# Unicode. `‡` (U+2021) and `†` (U+2020) are the glyph slots these fonts use
# for the extremely common e-kar/o-kar vowel signs, so they show up densely
# in converted text and essentially never in genuine English or already-
# correct Unicode Bengali — that density is what we use to detect it.
_BIJOY_SIGNAL_CHARS = "‡†"
_BIJOY_SIGNAL_THRESHOLD = 0.01


def _looks_like_bijoy_encoded(text: str) -> bool:
    if not text:
        return False
    signal_count = sum(text.count(c) for c in _BIJOY_SIGNAL_CHARS)
    return (signal_count / len(text)) > _BIJOY_SIGNAL_THRESHOLD


def _fix_legacy_bengali_encoding(text: str) -> str:
    """Re-decode legacy Bijoy/SutonnyMJ-encoded text into real Bengali Unicode.

    Safe to call on any extracted text: it only rewrites text that matches
    the Bijoy signal above, and leaves normal English/Unicode text alone.
    """
    if not _looks_like_bijoy_encoded(text):
        return text
    try:
        from bijoy2unicode.converter import Unicode as _BijoyConverter

        converted = _BijoyConverter().convertBijoyToUnicode(text)
    except Exception as exc:
        logger.warning(f"Bijoy-to-Unicode conversion failed: {exc!r}, keeping original text")
        return text
    return converted or text


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
            return _fix_legacy_bengali_encoding(text)
    except Exception as exc:
        logger.warning(f"pdfplumber failed: {exc!r}, trying PyMuPDF")

    # PyMuPDF fallback
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    for page in doc:
        text_parts.append(page.get_text())
    return _fix_legacy_bengali_encoding("\n\n".join(text_parts).strip())


def extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return _fix_legacy_bengali_encoding("\n\n".join(paragraphs))


def extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return _fix_legacy_bengali_encoding(data.decode(enc))
        except UnicodeDecodeError:
            continue
    return _fix_legacy_bengali_encoding(data.decode("utf-8", errors="replace"))


async def extract_url(url: str) -> str:
    await _assert_safe_url(url)
    current = url
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        for _ in range(_MAX_REDIRECTS):
            resp = await client.get(
                current,
                headers={"User-Agent": "ChatCraftBot/1.0 (+https://chatcraft.ai)"},
            )
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    raise ValueError(f"Redirect response with no Location header for {current!r}")
                current = str(httpx.URL(current).join(location))
                await _assert_safe_url(current)
                continue
            resp.raise_for_status()
            html = resp.text
            break
        else:
            raise UnsafeURLError(f"Too many redirects while fetching {url!r}")

    soup = BeautifulSoup(html, "lxml")

    # Remove boilerplate tags
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
        tag.decompose()

    # Prefer main content element if present
    main = soup.find("main") or soup.find("article") or soup.body
    if not main:
        return soup.get_text(separator="\n")

    return main.get_text(separator="\n")


async def extract_text_for_document(
    doc_type: str, file_url: str | None, source_url: str | None, raw_content: str | None
) -> str:
    """
    Dispatch to the right extractor based on document type.
    Returns raw extracted text.

    `raw_content` wins over re-fetching the original source whenever it's
    set: for type='text' it always has been, and for pdf/docx/txt/url it
    gets populated once a document is edited via the update-content API/tool
    (see agent_kb_service.set_document_content), making that edited text the
    source of truth for every reprocessing run from then on.
    """
    if raw_content:
        return raw_content

    if doc_type == "text":
        return ""

    if doc_type == "url":
        return await extract_url(source_url or file_url or "")

    # Remaining types require file bytes
    if not file_url:
        raise ValueError(f"file_url required for document type '{doc_type}'")

    from app.services.storage import download_minio_object, local_path_for_url, minio_key_for_url

    minio_key = minio_key_for_url(file_url)
    if minio_key is not None:
        # Use boto3 directly — bypasses SSRF guard and Docker-internal DNS
        # (minio:9000 resolves to a private IP that _assert_safe_url rejects).
        data = await download_minio_object(minio_key)
    else:
        local = local_path_for_url(file_url)
        if local is not None:
            if not local.exists():
                raise FileNotFoundError(f"Local upload not found: {local}")
            data = local.read_bytes()
        else:
            data = await _download_bytes(file_url)

    if doc_type == "pdf":
        return extract_pdf(data)
    if doc_type == "docx":
        return extract_docx(data)
    if doc_type == "txt":
        return extract_txt(data)

    raise ValueError(f"Unsupported document type: {doc_type}")
