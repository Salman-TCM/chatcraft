"""
Token-aware chunking using LangChain's RecursiveCharacterTextSplitter
with tiktoken encoding. Produces 500-token chunks with 50-token overlap.
"""

from dataclasses import dataclass

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

CHUNK_SIZE = 500  # tokens
CHUNK_OVERLAP = 50  # tokens
ENCODING = "cl100k_base"  # matches text-embedding-3-small


@dataclass
class Chunk:
    index: int
    content: str
    token_count: int


_splitter: RecursiveCharacterTextSplitter | None = None
_encoder: tiktoken.Encoding | None = None


def _get_splitter() -> RecursiveCharacterTextSplitter:
    global _splitter
    if _splitter is None:
        _splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name=ENCODING,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
    return _splitter


def _get_encoder() -> tiktoken.Encoding:
    global _encoder
    if _encoder is None:
        _encoder = tiktoken.get_encoding(ENCODING)
    return _encoder


def chunk_text(text: str) -> list[Chunk]:
    """Split `text` into token-bounded chunks."""
    splitter = _get_splitter()
    encoder = _get_encoder()

    raw_chunks = splitter.split_text(text)
    chunks: list[Chunk] = []
    for i, content in enumerate(raw_chunks):
        token_count = len(encoder.encode(content))
        chunks.append(Chunk(index=i, content=content, token_count=token_count))
    return chunks
