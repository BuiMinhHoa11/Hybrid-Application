"""public-api trên EC2 uniexam-public: API gateway thuần túy.

Không kết nối PostgreSQL hay Redis. Mọi request (trừ /health) được chuyển nguyên vẹn
qua WireGuard tới private-api (PRIVATE_API_URL, mặc định http://10.200.0.2:8080).
private-api tự kiểm tra JWT và phân quyền.
"""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from uuid import UUID

import httpx
import anyio
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from . import offline_buffer
from .config import settings
from .offline_schema import OfflineSubmit

log = logging.getLogger("uniexam.gateway")


async def offline_relay_loop():
    """Có bài giữ tạm trên S3 thì định kỳ chuyển về private-api (khi OpenStack chạy lại)."""
    while True:
        try:
            await anyio.to_thread.run_sync(offline_buffer.relay_once)
        except Exception as exc:  # S3/IAM lỗi: ghi log, thử lại vòng sau
            log.error("Chuyển bài giữ tạm thất bại: %s: %s", type(exc).__name__, exc)
        await asyncio.sleep(settings.offline_relay_seconds)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(offline_relay_loop()) if offline_buffer.enabled() else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="UniExam Public Gateway", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[s.strip() for s in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Header chỉ có nghĩa trên một chặng kết nối, hoặc sẽ sai sau khi httpx đã giải nén nội dung.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
    "transfer-encoding", "upgrade", "host", "content-length", "content-encoding", "accept-encoding",
}


@app.get("/health", tags=["health"])
async def health(shallow: bool = False):
    """Gateway sống; kèm trạng thái đường WireGuard tới private-api.

    shallow=1: chỉ báo gateway còn sống (trang Trạng thái hệ thống gọi từ private-api, tránh gọi vòng ngược lại).
    """
    if shallow:
        return {"status": "ok", "service": "public-gateway"}
    private_status = "down"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{settings.private_api_url.rstrip('/')}/health")
            if res.status_code == 200:
                private_status = "ok"
    except httpx.HTTPError:
        pass
    return {
        "status": "ok" if private_status == "ok" else "degraded",
        "service": "public-gateway",
        "checks": {"private-api": private_status},
    }


@app.get("/admin/exam-alerts/stream")
async def admin_alert_stream_proxy(request: Request):
    # Forward the Bearer header to private-api; never put admin tokens in URLs.
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=40.0))
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    upstream = None
    try:
        upstream = await client.send(client.build_request("GET",
            f"{settings.private_api_url.rstrip('/')}/admin/exam-alerts/stream", headers=headers), stream=True)
        if upstream.status_code != 200:
            content = await upstream.aread()
            status, content_type = upstream.status_code, upstream.headers.get("content-type", "application/json")
            await upstream.aclose()
            await client.aclose()
            return Response(content, status_code=status, headers={"Content-Type": content_type, "Cache-Control": "no-store"})
    except httpx.HTTPError:
        if upstream is not None:
            await upstream.aclose()
        await client.aclose()
        return JSONResponse(status_code=502, content={"error": {"code": "PRIVATE_API_UNREACHABLE",
            "message": "Không kết nối được luồng cảnh báo quản trị"}})

    async def forward():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        except httpx.HTTPError:
            yield 'event: unavailable\ndata: {}\n\n'
        finally:
            with anyio.CancelScope(shield=True):
                await upstream.aclose()
                await client.aclose()

    return StreamingResponse(forward(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.post("/exam-sessions/{session_id}/offline-submit")
async def offline_submit_gateway(session_id: UUID, request: Request):
    """Nộp bài khi mất mạng. Bình thường chuyển thẳng tới private-api; private-api không trả lời
    (OpenStack sập, WireGuard đứt) thì giữ tạm bài đã mã hóa trên S3 và trả 202 cho sinh viên."""
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    body = await request.body()
    upstream = None
    try:
        async with httpx.AsyncClient(timeout=settings.offline_forward_timeout_seconds) as client:
            upstream = await client.post(f"{settings.private_api_url.rstrip('/')}/exam-sessions/{session_id}/offline-submit",
                                         headers=headers, content=body)
    except httpx.RequestError:
        upstream = None
    if upstream is not None and upstream.status_code < 500:
        out_headers = {k: v for k, v in upstream.headers.items()
                       if k.lower() not in HOP_BY_HOP and not k.lower().startswith("access-control-")}
        return Response(content=upstream.content, status_code=upstream.status_code, headers=out_headers)
    if not offline_buffer.enabled():
        return _error(502, "PRIVATE_API_UNREACHABLE", "Không kết nối được Private API qua WireGuard")
    student = offline_buffer.student_from_token(request.headers.get("authorization"))
    if student is None:
        return _error(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ")
    try:
        submission = OfflineSubmit.model_validate_json(body)
    except ValidationError:
        return _error(422, "UNPROCESSABLE", "Dữ liệu bài nộp không hợp lệ")
    try:
        await anyio.to_thread.run_sync(offline_buffer.store, session_id, student, submission)
    except Exception as exc:  # S3 cũng lỗi: trình duyệt giữ bài và thử lại sau
        log.error("Không giữ tạm được bài trên S3: %s: %s", type(exc).__name__, exc)
        return _error(502, "PRIVATE_API_UNREACHABLE", "Máy chủ đang gặp sự cố, bài vẫn được giữ trên máy và sẽ gửi lại")
    return JSONResponse(status_code=202, content={
        "buffered": True,
        "message": "Hệ thống chính đang gặp sự cố. Bài đã được lưu tạm an toàn và sẽ tự chuyển về khi hệ thống khôi phục."})


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def gateway_proxy(request: Request, path: str):
    if path.startswith("internal/"):
        # API nội bộ giữa các máy chủ: không mở ra Internet.
        return _error(404, "NOT_FOUND", "Không tìm thấy")
    target_url = f"{settings.private_api_url.rstrip('/')}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            upstream = await client.request(request.method, target_url, headers=headers, content=body)
    except httpx.RequestError as exc:
        return JSONResponse(
            status_code=502,
            content={"error": {"code": "PRIVATE_API_UNREACHABLE",
                               "message": "Không kết nối được Private API qua WireGuard",
                               "detail": type(exc).__name__}},
        )

    # CORS do gateway tự xử lý; bỏ header CORS của private-api để không bị lặp.
    out_headers = {k: v for k, v in upstream.headers.items()
                   if k.lower() not in HOP_BY_HOP and not k.lower().startswith("access-control-")}
    return Response(content=upstream.content, status_code=upstream.status_code, headers=out_headers)
