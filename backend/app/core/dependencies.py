from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis import redis_dependency

security = HTTPBearer()

# Typed shorthand for injecting a DB session into route handlers
DBSession = Annotated[AsyncSession, Depends(get_db)]

# Typed shorthand for injecting an async Redis client
RedisClient = Annotated[aioredis.Redis, Depends(redis_dependency)]

# Typed shorthand for injecting the raw bearer token
BearerToken = Annotated[HTTPAuthorizationCredentials, Depends(security)]
