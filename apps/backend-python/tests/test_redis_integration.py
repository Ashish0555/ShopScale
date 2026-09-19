import os

import pytest

if os.getenv("RUN_REDIS_TESTS") != "1":
    pytest.skip("Set RUN_REDIS_TESTS=1 with Redis available", allow_module_level=True)

from app.cache.redis_store import RedisCache


def test_redis_cache_round_trip_and_counter():
    cache = RedisCache()
    key = "shopscale:test:cache"
    cache.set_json(key, {"value": 1}, 30)
    assert cache.get_json(key) == {"value": 1}
    assert cache.increment_window("shopscale:test:rate", 30) == 1
    cache.delete(key)
    assert cache.get_json(key) is None
