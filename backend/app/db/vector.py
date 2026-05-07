from pgvector.sqlalchemy import Vector
from sqlalchemy import Index, func, select
from sqlalchemy.ext.asyncio import AsyncSession

EMBEDDING_DIMENSIONS = 1536  # text-embedding-3-small output size


async def cosine_similarity_search(
    session: AsyncSession,
    table,
    embedding_col,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.75,
) -> list:
    """
    Return up to top_k rows whose embedding column is within cosine distance
    of query_embedding, filtered to similarity >= threshold.

    Cosine similarity = 1 - cosine_distance (pgvector's <=> operator).
    """
    distance_expr = embedding_col.op("<=>")(query_embedding)
    similarity_expr = (1 - distance_expr).label("similarity")

    stmt = (
        select(table, similarity_expr)
        .where((1 - distance_expr) >= threshold)
        .order_by(distance_expr)
        .limit(top_k)
    )

    result = await session.execute(stmt)
    return result.all()


__all__ = ["Vector", "EMBEDDING_DIMENSIONS", "cosine_similarity_search"]
