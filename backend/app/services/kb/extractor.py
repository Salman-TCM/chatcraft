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
    """
    if doc_type == "text":
        return raw_content or ""

    if doc_type == "url":
        return await extract_url(source_url or file_url or "")

    # Remaining types require file bytes
    if not file_url:
        raise ValueError(f"file_url required for document type '{doc_type}'")

    # Read local-storage files from disk to avoid HTTP round-trips inside
    # Docker (the celery worker container shares the uploads volume with the
    # backend container, so this works without any network dependency).
    from app.services.storage import local_path_for_url

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
