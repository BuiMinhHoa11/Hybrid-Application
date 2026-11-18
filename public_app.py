import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from .config import settings

# PUBLIC-API ĐÃ TRỞ THÀNH API GATEWAY THUẦN TÚY (KHÔNG KẾT NỐI DATABASE HAY REDIS NỮA!)
app = FastAPI(title="UniExam Public Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[s.strip() for s in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/health", tags=["health"])
async def health():
    # Kiểm tra xem đường truyền WireGuard tới Private API có thông không
    private_status = "down"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get(f"{settings.private_api_url}/health")
            if res.status_code == 200:
                private_status = "ok"
    except Exception:
        pass
    return {
        "status": "ok" if private_status == "ok" else "degraded",
        "service": "public-gateway",
        "wireguard_private_api": private_status
    }

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def gateway_proxy(request: Request, path: str):
    target_url = f"{settings.private_api_url}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    body = await request.body()

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            proxy_res = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
            return Response(
                content=proxy_res.content,
                status_code=proxy_res.status_code,
                headers=dict(proxy_res.headers)
            )
        except httpx.RequestError as exc:
            return Response(
                content=f'{{"error": "Không thể kết nối tới Private API qua WireGuard: {exc}"}}',
                status_code=502,
                media_type="application/json"
            )

