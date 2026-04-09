import threading
import time
from collections import defaultdict, deque

_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(namespace: str, key: str, *, limit: int, window_sec: int) -> tuple[bool, int]:
    bucket_key = f"{namespace}:{key.strip().lower() or 'anonymous'}"
    now = time.time()
    with _LOCK:
        bucket = _BUCKETS[bucket_key]
        while bucket and (now - bucket[0]) > window_sec:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_sec - (now - bucket[0])))
            return False, retry_after
        bucket.append(now)
        return True, 0


def clear_rate_limit(namespace: str, key: str) -> None:
    bucket_key = f"{namespace}:{key.strip().lower() or 'anonymous'}"
    with _LOCK:
        _BUCKETS.pop(bucket_key, None)
