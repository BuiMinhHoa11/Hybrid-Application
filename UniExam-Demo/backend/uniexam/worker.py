"""Redis-backed grading worker with DB-authoritative fallback reconciliation."""
import asyncio
from contextlib import asynccontextmanager
import logging
import os
import socket
import threading
import time

from fastapi import FastAPI
from fastapi.responses import JSONResponse
import httpx

from uniexam.config import settings
from uniexam.grading_core import grade_submission
from uniexam.grading_queue import acknowledge, enqueue, health as redis_health, read_jobs, ensure_group

logger = logging.getLogger("uniexam.worker")
worker_id = os.environ.get("WORKER_ID", f"{socket.gethostname()}:{os.getpid()}")[:100]
state = {"last_contact": None, "graded": 0, "failed": 0, "redis_failures": 0}


def process_claim(client: httpx.Client, *, submission_id: str | None = None) -> bool:
    # The private API claims atomically from PostgreSQL. Redis only selects work.
    response = client.post("/grading/claim", json={"workerId": worker_id, "submissionId": submission_id} if submission_id else {"workerId": worker_id})
    if response.status_code == 204:
        state["last_contact"] = time.monotonic()
        return False
    response.raise_for_status()
    state["last_contact"] = time.monotonic()
    if not response.content:
        return False

    claim = response.json()
    reference = {"workerId": worker_id, "attempt": claim["attempt"], "claimToken": claim["claimToken"]}
    try:
        result = grade_submission(claim)
        saved = client.post(f"/grading/{claim['submissionId']}/result", json={**reference, **result})
        saved.raise_for_status()
        state["last_contact"] = time.monotonic()
        state["graded"] += 1
    except Exception as error:
        state["failed"] += 1
        logger.warning("Grading attempt failed: %s", type(error).__name__)
        try:
            failure = client.post(f"/grading/{claim['submissionId']}/fail", json={**reference, "reason": f"{type(error).__name__}: grading failed"})
            failure.raise_for_status()
        except httpx.HTTPError:
            logger.warning("Could not release grading claim; lease expiry will retry")
    return True


def polling_loop(stop: threading.Event):
    delay = settings.grading_poll_seconds
    try:
        ensure_group()
    except Exception:
        logger.exception("Redis queue unavailable at worker startup")
    with httpx.Client(base_url=settings.private_api_url.rstrip("/"), headers={"X-Internal-Api-Key": settings.internal_api_key}, timeout=10) as api:
        last_reconcile = float("-inf")
        while not stop.is_set():
            try:
                # Thời gian chờ Redis phải NGẮN hơn socket_timeout (5s) của client Redis,
                # nếu không mỗi lần đọc đều TimeoutError và worker kẹt mãi ở chế độ backoff.
                jobs = read_jobs(worker_id, block_ms=min(4000, max(1000, int(settings.grading_poll_seconds * 1000))), count=10)
                if jobs:
                    for entry_id, fields in jobs:
                        process_claim(api, submission_id=fields.get("submissionId"))
                        acknowledge(entry_id)
                    delay = settings.grading_poll_seconds
                    continue
                # Đối soát: nhận bài còn chờ chấm mà Redis không báo (vd. lúc Redis gián đoạn).
                # Chỉ chạy mỗi GRADING_RECONCILE_SECONDS (mặc định 60 s) thay vì mỗi vòng, để worker
                # không gọi private-api và PostgreSQL liên tục khi đang rảnh.
                if time.monotonic() - last_reconcile >= settings.grading_reconcile_seconds:
                    last_reconcile = time.monotonic()
                    process_claim(api)
                delay = settings.grading_poll_seconds
            except Exception as error:
                state["redis_failures"] += 1
                logger.warning("Grading transport/API unavailable: %s", type(error).__name__)
                stop.wait(delay)
                delay = min(30, delay * 2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = threading.Event()
    task = asyncio.create_task(asyncio.to_thread(polling_loop, stop))
    try:
        yield
    finally:
        stop.set()
        await task


health_app = FastAPI(title="UniExam Python grading worker", lifespan=lifespan)


@health_app.get("/health")
def health():
    last = state["last_contact"]
    # Worker chỉ gọi private-api khi có bài hoặc mỗi lần đối soát, nên cho phép tới 3 chu kỳ đối soát không liên lạc.
    api_healthy = last is not None and time.monotonic() - last < max(60, 5 * settings.grading_poll_seconds, 3 * settings.grading_reconcile_seconds)
    queue_healthy = redis_health()
    ok = api_healthy and queue_healthy
    return JSONResponse({"status": "ok" if ok else "degraded", "service": "grading-worker", "graded": state["graded"], "failed": state["failed"], "checks": {"private-api": "ok" if api_healthy else "unreachable", "redis": "ok" if queue_healthy else "unreachable"}}, status_code=200 if ok else 503)
