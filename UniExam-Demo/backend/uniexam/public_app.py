"""public-api trên EC2 uniexam-public: API gateway thuần túy.

Không kết nối PostgreSQL hay Redis. Mọi request (trừ /health) được chuyển nguyên vẹn
qua WireGuard tới private-api (PRIVATE_API_URL, mặc định http://10.200.0.2:8080).
private-api tự kiểm tra JWT và phân quyền.
"""
import httpx
import anyio
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .config import settings

app = FastAPI(title="UniExam Public Gateway", version="1.0.0")

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
async def health():
    """Gateway sống; kèm trạng thái đường WireGuard tới private-api."""
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


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def gateway_proxy(request: Request, path: str):
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
