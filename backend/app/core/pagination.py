"""Shared pagination helpers."""
from __future__ import annotations

from typing import Annotated

from fastapi import Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select


# Reusable query-param types
PageParam  = Annotated[int, Query(ge=1, description="Page number (1-based)")]
LimitParam = Annotated[int, Query(ge=1, le=200, description="Items per page")]


def paginate(query: Select, page: int, limit: int) -> Select:
    return query.offset((page - 1) * limit).limit(limit)


async def count_query(db: AsyncSession, query: Select) -> int:
    count_q = select(func.count()).select_from(query.subquery())
    result = await db.execute(count_q)
    return result.scalar_one()


def page_meta(page: int, limit: int, total: int) -> dict:
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "pages": max(1, -(-total // limit)),  # ceiling division
    }
