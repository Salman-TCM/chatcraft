"""
OpenAI text-embedding-3-small embedding generation with batching.
Handles rate limits via exponential back-off on retry.
"""
import asyncio
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100          # OpenAI allows up to 2048 inputs per call; 100 is safe
MAX_TOKENS_PER_BATCH = 300_000  # stay well under 1M TPM limit

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a single batch of ≤BATCH_SIZE texts. Returns one vector per text."""
    resp = await _get_client().embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
        encoding_format="float",
    )
    # Response items are returned in the same order as input
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed all texts, batching to BATCH_SIZE.
    Retries each batch up to 3 times with exponential back-off.
    """
    all_vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        for attempt in range(3):
            try:
                vectors = await embed_batch(batch)
                all_vectors.extend(vectors)
                break
            except Exception as exc:
                if attempt == 2:
                    raise
                wait = 2 ** attempt * 5  # 5s, 10s, then raise
                await asyncio.sleep(wait)
    return all_vectors
