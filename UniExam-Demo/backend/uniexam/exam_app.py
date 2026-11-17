import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from .app_factory import create_app
from .config import settings
from .db import SessionLocal
from .routers import sessions, grading


def tick_once():
    from .services.exam_lifecycle import tick
    with SessionLocal.begin() as db:
        tick(db)


async def lifecycle_loop():
    while True:
        try:
            await asyncio.to_thread(tick_once)
        except Exception as exc:
            logging.getLogger("uniexam").error("Lifecycle failed: %s", type(exc).__name__)
        await asyncio.sleep(settings.lifecycle_interval_seconds)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(lifecycle_loop()) if settings.lifecycle_enabled else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = create_app("private-api", lifespan=lifespan)
app.include_router(sessions.router)
app.include_router(grading.router)
