import json
from typing import Any, Optional

from app.core.config import settings

try:
    from redis.asyncio import Redis
    redis_available = True
except ImportError:
    Redis = None  # type: ignore[assignment]
    redis_available = False

redis_client: Optional[Redis] = None

async def init_cache() -> None:
    global redis_client
    if not redis_available or not settings.REDIS_URL:
        redis_client = None
        return

    try:
        client = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        await client.ping()
        redis_client = client
    except Exception:
        if "client" in locals():
            await client.close()
        redis_client = None

async def close_cache() -> None:
    if redis_client:
        await redis_client.close()

async def get_cache(key: str) -> Optional[Any]:
    if not redis_client:
        return None
    try:
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None

async def set_cache(key: str, value: Any, expire: int = 300) -> None:
    if not redis_client:
        return
    try:
        await redis_client.setex(key, expire, json.dumps(value))
    except Exception:
        pass

async def delete_cache(key: str) -> None:
    if not redis_client:
        return
    try:
        await redis_client.delete(key)
    except Exception:
        pass
