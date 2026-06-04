"""
BrowserService — lightweight wrapper used by the Flow Executor.

Provides:
  fetch_content(url)   — visit a URL and return extracted text
  research(query, max_pages)  — search + visit top results, return combined summary
"""
import re

import httpx


async def _fetch_url_text(url: str) -> str:
    """Fetch a URL and return stripped plain text (max 5000 chars)."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "ChatCraft-Browser-Agent/1.0"},
        ) as client:
            resp = await client.get(url)
        text = re.sub(r"<[^>]+>", " ", resp.text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:5000]
    except Exception as exc:
        return f"[fetch error: {exc}]"


async def _duckduckgo_urls(query: str, max_results: int = 5) -> list[str]:
    """Return a list of result URLs from DuckDuckGo HTML search."""
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as client:
            resp = await client.get(
                "https://html.duckduckgo.com/html/",
                params={"q": query},
            )
        urls = re.findall(r'href="(https?://[^"&]+)"', resp.text)
        seen: list[str] = []
        for u in urls:
            if u not in seen and "duckduckgo.com" not in u:
                seen.append(u)
            if len(seen) >= max_results:
                break
        return seen
    except Exception:
        return []


class BrowserService:
    async def fetch_content(self, url: str) -> str:
        """Visit a URL and return its extracted text content."""
        return await _fetch_url_text(url)

    async def research(self, query: str, max_pages: int = 5) -> str:
        """Search the web for a query, visit top results, and return combined content."""
        urls = await _duckduckgo_urls(query, max_results=max_pages)
        if not urls:
            return f"No search results found for: {query}"

        parts = [f"Research results for: {query}\n"]
        for i, url in enumerate(urls[:max_pages], 1):
            content = await _fetch_url_text(url)
            parts.append(f"[Source {i}] {url}\n{content[:1500]}")

        return "\n\n".join(parts)
