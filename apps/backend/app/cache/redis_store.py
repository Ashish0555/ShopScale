import json

import redis

from app.core.config import settings
from app.cache.store import MemoryCache


class RedisCache:
    def __init__(self) -> None:
        self.client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    def get_json(self, key: str) -> dict | None:
        try:
            value = self.client.get(key)
            return json.loads(value) if value else None
        except redis.RedisError:
            return None

    def set_json(self, key: str, value: dict, ttl: int) -> None:
        try:
            self.client.setex(key, ttl, json.dumps(value, default=str))
        except redis.RedisError:
            pass

    def delete(self, key: str) -> None:
        try:
            self.client.delete(key)
        except redis.RedisError:
            pass

    async def incr_window(self, key: str, window: int) -> int:
        count = self.client.incr(key)
        if count == 1:
            self.client.expire(key, window)
        return count


cache = MemoryCache() if settings.node_env == "test" else RedisCache()
