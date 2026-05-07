"""
Run this script to verify Supabase + PostgreSQL connectivity before running migrations.

    cd backend
    source venv/bin/activate
    python -m app.db.verify
"""

import asyncio
import sys

import asyncpg
from loguru import logger
from sqlalchemy import text

from app.core.config import settings


async def verify_postgres() -> bool:
    """Test a direct asyncpg connection to the database."""
    try:
        # asyncpg expects postgresql:// not postgresql+asyncpg://
        url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(url)
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        logger.info(f"PostgreSQL connected: {version}")
        return True
    except Exception as exc:
        logger.error(f"PostgreSQL connection failed: {exc}")
        return False


async def verify_pgvector() -> bool:
    """Confirm pgvector extension is available."""
    try:
        url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(url)
        result = await conn.fetchval(
            "SELECT default_version FROM pg_available_extensions WHERE name = 'vector'"
        )
        await conn.close()
        if not result:
            logger.warning("pgvector package not available — install pgvector on the DB server")
            return False

        # Also confirm it's been CREATED (not just available)
        installed = await conn.fetchval(
            "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
        )
        if installed:
            logger.info(f"pgvector installed and active: v{installed}")
            return True
        logger.warning(
            "pgvector package exists but extension not created — "
            "run: alembic upgrade head"
        )
        return False
    except Exception as exc:
        logger.error(f"pgvector check failed: {exc}")
        return False


async def verify_supabase() -> bool:
    """Test Supabase client auth."""
    if not settings.supabase_url or not settings.supabase_key:
        logger.warning("SUPABASE_URL / SUPABASE_KEY not set — skipping Supabase check")
        return True
    try:
        from app.db.supabase import get_supabase_client
        client = get_supabase_client()
        # A lightweight call to confirm credentials are valid
        client.storage.list_buckets()
        logger.info(f"Supabase client connected: {settings.supabase_url}")
        return True
    except Exception as exc:
        logger.error(f"Supabase connection failed: {exc}")
        return False


async def verify_sqlalchemy() -> bool:
    """Test the SQLAlchemy async engine and session factory."""
    try:
        from app.db.session import engine
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT current_database(), current_user"))
            row = result.fetchone()
            logger.info(f"SQLAlchemy engine connected — db={row[0]}, user={row[1]}")
        await engine.dispose()
        return True
    except Exception as exc:
        logger.error(f"SQLAlchemy engine failed: {exc}")
        return False


async def main() -> None:
    logger.info("Running ChatCraft AI database connectivity checks...")

    results = await asyncio.gather(
        verify_postgres(),
        verify_pgvector(),
        verify_sqlalchemy(),
        verify_supabase(),
        return_exceptions=False,
    )

    all_passed = all(results)

    if all_passed:
        logger.success("All checks passed — database is ready")
        sys.exit(0)
    else:
        logger.error("One or more checks failed — review errors above")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
