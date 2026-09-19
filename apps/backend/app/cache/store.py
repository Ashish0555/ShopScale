from collections import defaultdict
from time import monotonic


class MemoryCache:
    def __init__(self) -> None:
        self.values: dict[str, tuple[float, str]] = {}
        self.counts: defaultdict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))

    async def get(self, key: str) -> str | None:
        value = self.values.get(key)
        if not value or value[0] <= monotonic():
            self.values.pop(key, None)
            return None
        return value[1]

    async def set(self, key: str, value: str, ttl: int) -> None:
        self.values[key] = (monotonic() + ttl, value)

    async def incr_window(self, key: str, window: int) -> int:
        expiry, count = self.counts[key]
        if expiry <= monotonic():
            expiry, count = monotonic() + window, 0
        count += 1
        self.counts[key] = expiry, count
        return count
