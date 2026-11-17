"""Redis Streams transport for grading jobs.

PostgreSQL remains the source of truth for submissions and grading results. Redis
only transports job notifications and provides consumer-group delivery/retry.
"""
from __future__ import annotations

import logging
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from uniexam.config import settings

logger = logging.getLogger("uniexam.grading_queue")
QUEUE_NAME = settings.grading_queue_name
GROUP_NAME = settings.grading_queue_group
_client: Redis | None = None


def client() -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=5, health_check_interval=30)
    return _client


def ensure_group() -> None:
    try:
        client().xgroup_create(QUEUE_NAME, GROUP_NAME, id="0", mkstream=True)
    except RedisError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def enqueue(submission_id: str, *, reason: str = "submitted") -> str | None:
    """Publish a submission notification; the DB remains authoritative."""
    try:
        ensure_group()
        return str(client().xadd(QUEUE_NAME, {"submissionId": str(submission_id), "reason": reason}, maxlen=100_000, approximate=True))
    except RedisError:
        logger.exception("Could not enqueue grading job", extra={"submission_id": str(submission_id)})
        return None


def health() -> bool:
    try:
        return bool(client().ping())
    except RedisError:
        return False


def read_jobs(consumer: str, *, block_ms: int = 5000, count: int = 10) -> list[tuple[str, dict[str, Any]]]:
    ensure_group()
    rows = client().xreadgroup(GROUP_NAME, consumer, {QUEUE_NAME: ">"}, count=count, block=block_ms)
    jobs: list[tuple[str, dict[str, Any]]] = []
    for _stream, entries in rows:
        jobs.extend((str(entry_id), fields) for entry_id, fields in entries)
    return jobs


def acknowledge(entry_id: str) -> None:
    client().xack(QUEUE_NAME, GROUP_NAME, entry_id)


def requeue(entry_id: str, submission_id: str, *, reason: str = "retry") -> str | None:
    new_id = enqueue(submission_id, reason=reason)
    acknowledge(entry_id)
    return new_id
