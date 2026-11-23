# UniExam backend (Python/FastAPI)

Một image Python (`backend/Dockerfile`) dùng cho cả ba service, mỗi service một lệnh `uvicorn` khác nhau:

| Service | Module | Chạy ở | Vai trò |
|---|---|---|---|
| `public-api` | `uniexam.public_app:app` | uniexam-public (AWS), `127.0.0.1:4000` | Gateway: chuyển mọi request qua WireGuard tới private-api. Không có DB/Redis. |
| `private-api` | `uniexam.exam_app:app` | uniexam-private, `10.200.0.2:8080` | Toàn bộ nghiệp vụ, kiểm tra JWT, nơi duy nhất ghi PostgreSQL, ghi phiếu báo vào Redis, vòng lifecycle 5 giây. |
| `grading-worker` | `uniexam.worker:health_app` | uniexam-private, `127.0.0.1:8081` | Đọc Redis Stream `uniexam:grading`, gọi `/grading/claim` và `/grading/{id}/result` của private-api (kèm `X-Internal-Api-Key`). |

Schema và migration ở `../database/uniexam_database/`. Lệnh quản trị (`python -m uniexam.cli ...`): `init-db`, `create-admin`, `change-password`, `seed-demo` (bị chặn khi `ENVIRONMENT=production`), `import-legacy` (xem [IMPORT-LEGACY.md](IMPORT-LEGACY.md)).

Triển khai: xem [../README.production.md](../README.production.md).
