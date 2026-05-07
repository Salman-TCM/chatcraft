import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """
    Yield a real async DB session for integration tests.
    Each test runs in its own transaction that is rolled back on teardown
    so tests remain isolated without truncating tables.
    """
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
    )

    async_session = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as conn:
        async with async_session(bind=conn) as session:
            yield session
            await session.rollback()

    await engine.dispose()
