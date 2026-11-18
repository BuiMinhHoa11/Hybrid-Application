import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from .app_factory import create_app
from .config import settings
from .db import SessionLocal
from .routers import accounts, questions, papers, exams, results, sessions, grading


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

# TẤT CẢ ROUTERS NGHIỆP VỤ NẰM TRỌN VẸN Ở PRIVATE-API (NỘI BỘ PRIVATE CLOUD)
for routes in [accounts, questions, papers, exams, results, sessions, grading]:
    app.include_router(routes.router)

