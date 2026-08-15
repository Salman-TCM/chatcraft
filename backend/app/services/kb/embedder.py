"""
Embedding generation for the KB pipeline.
Uses whichever embedding-capable provider the document owner actually has
configured (their own OpenAI or Google key first, then the server's), instead
of requiring a global OpenAI key. Handles rate limits via exponential
back-off on retry.
"""

import asyncio

from openai import AsyncOpenAI

from app.core.config import settings
from app.models.knowledge_base import EMBEDDING_DIM

OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001"
BATCH_SIZE = 100  # OpenAI allows up to 2048 inputs per call; 100 is safe
MAX_TOKENS_PER_BATCH = 300_000  # stay well under 1M TPM limit


class NoEmbeddingProviderConfigured(RuntimeError):
    """Neither the document owner nor the server has a usable embedding API key."""


def resolve_embedding_provider(user_keys: dict[str, str]) -> tuple[str, str]:
    """Pick (provider, api_key) — the owner's own key wins, then the server default."""
    if user_keys.get("openai"):
        return "openai", user_keys["openai"]
    if settings.openai_api_key:
        return "openai", settings.openai_api_key
    if user_keys.get("google"):
        return "google", user_keys["google"]
    if settings.google_ai_api_key:
        return "google", settings.google_ai_api_key
    raise NoEmbeddingProviderConfigured(
        "No embedding-capable API key configured. Add an OpenAI or Google API key "
        "under Model Keys to enable knowledge base uploads."
    )


_openai_clients: dict[str, AsyncOpenAI] = {}


def _get_openai_client(api_key: str) -> AsyncOpenAI:
    client = _openai_clients.get(api_key)
    if client is None:
        client = AsyncOpenAI(api_key=api_key)
        _openai_clients[api_key] = client
    return client


async def _embed_batch_openai(texts: list[str], api_key: str) -> list[list[float]]:
    resp = await _get_openai_client(api_key).embeddings.create(
        model=OPENAI_EMBEDDING_MODEL,
        input=texts,
        encoding_format="float",
    )
    # Response items are returned in the same order as input
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


async def _embed_batch_google(texts: list[str], api_key: str) -> list[list[float]]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    resp = await client.aio.models.embed_content(
        model=GOOGLE_EMBEDDING_MODEL,
        contents=texts,
        # Truncated (Matryoshka) to match the fixed pgvector column width so
        # OpenAI- and Google-embedded chunks stay compatible side by side.
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
    )
    return [e.values for e in resp.embeddings]


async def embed_texts(texts: list[str], provider: str, api_key: str) -> list[list[float]]:
    """
    Embed all texts, batching to BATCH_SIZE.
    Retries each batch up to 3 times with exponential back-off.
    """
    embed_batch = _embed_batch_openai if provider == "openai" else _embed_batch_google
    all_vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        for attempt in range(3):
            try:
                vectors = await embed_batch(batch, api_key)
                all_vectors.extend(vectors)
                break
            except Exception:
                if attempt == 2:
                    raise
                wait = 2**attempt * 5  # 5s, 10s, then raise
                await asyncio.sleep(wait)
    return all_vectors
