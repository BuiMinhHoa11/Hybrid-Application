# UniExam — hệ thống thi trực tuyến trên Hybrid Cloud

Website thi trắc nghiệm và điền khuyết. Admin quản lý tài khoản; giáo viên soạn câu hỏi, tạo đề, hẹn giờ thi và công bố kết quả; sinh viên làm bài và xem điểm sau khi công bố.

Hệ thống chạy trên hai cloud nối với nhau bằng WireGuard:

| Máy | Vai trò | Thành phần |
|---|---|---|
| **uniexam-public** — AWS EC2, `13.211.215.60`, WireGuard `10.200.0.1` | Tiếp nhận người dùng | Nginx + Certbot (HTTPS), container frontend (React + Nginx), `public-api` (gateway) |
| **uniexam-private** — OpenStack, floating IP `172.24.4.252`, WireGuard `10.200.0.2` | Nghiệp vụ và dữ liệu | `private-api`, `grading-worker`, PostgreSQL, Redis, ổ Cinder `/srv/uniexam-data` |

Luồng request:

- `https://<domain>/api/*` → Nginx → `public-api` (gateway) → WireGuard → `private-api :8080`
- `https://<domain>/exam-api/*` (lúc làm bài) → Nginx → WireGuard → `private-api :8080`
- Chỉ `private-api` đọc ghi PostgreSQL. Khi nộp bài, `private-api` ghi mã bài vào Redis Stream; `grading-worker` đọc Redis rồi gọi `private-api` (`/grading/claim`, `/grading/{id}/result`, kèm `INTERNAL_API_KEY`) để nhận bài và trả điểm.
- PostgreSQL và Redis không mở cổng ra ngoài; `private-api` chỉ nghe trên `10.200.0.2:8080`.

Hướng dẫn triển khai từng máy: [README.production.md](README.production.md).

## Cấu trúc mã nguồn

```text
UniExam-Demo/
├── backend/
│   ├── uniexam/                  # Python/FastAPI
│   │   ├── public_app.py         # public-api: gateway chuyển tiếp sang private-api
│   │   ├── exam_app.py           # private-api: toàn bộ router nghiệp vụ + vòng lifecycle
│   │   ├── worker.py             # grading-worker: đọc Redis, gọi private-api để chấm
│   │   ├── routers/              # accounts, questions, papers, exams, sessions, grading, results
│   │   ├── services/             # lifecycle kỳ thi, chính sách công bố kết quả
│   │   └── cli.py                # init-db, create-admin, change-password, seed-demo, import-legacy
│   ├── compose.public.yaml       # stack chạy trên uniexam-public
│   ├── compose.private.yaml      # stack chạy trên uniexam-private
│   ├── Dockerfile                # image Python dùng chung cho cả 3 service
│   ├── scripts/healthcheck-private.sh  # giám sát bằng cron trên uniexam-private
│   ├── contracts/                # kiểu dữ liệu dùng chung với frontend
│   └── node/                     # backend Node.js cũ (giữ lại vì là workspace npm của frontend)
├── frontend/                     # React + Nginx (nginx.conf định tuyến /api và /exam-api)
├── database/
│   ├── uniexam_database/         # schema.sql + migration Alembic đang dùng
│   ├── design/                   # tài liệu thiết kế DB
│   └── node/                     # DB Node.js cũ (workspace npm)
├── docs/                         # đặc tả, cây thư mục
├── .env.private.example          # mẫu .env cho uniexam-private
└── .env.public.example           # mẫu .env cho uniexam-public
```

`backend/node` và `database/node` không còn chạy, nhưng **không được xóa**: `package.json` khai báo chúng là workspace và `frontend/Dockerfile` cần `package.json` của chúng để `npm ci` khớp với `package-lock.json`.

## Tài khoản

Tạo admin đầu tiên trên uniexam-private:

```bash
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli create-admin <tên>
```

Sau đó admin tạo giáo viên và sinh viên trên trang **Quản lý tài khoản**. Mật khẩu cần 8–200 ký tự. Đổi mật khẩu khi quên:

```bash
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli change-password <tên>
```

Database chỉ lưu bản băm Argon2 của mật khẩu, không xem lại được mật khẩu gốc.

## Quy trình sử dụng

1. Admin tạo tài khoản giáo viên và sinh viên.
2. Giáo viên nhập câu hỏi trắc nghiệm hoặc điền khuyết vào ngân hàng câu hỏi.
3. Tạo đề: chọn câu thủ công hoặc tự động theo chủ đề và độ khó. Đề giữ bản sao câu hỏi tại thời điểm tạo.
4. Tạo kỳ thi, chọn đề, giờ bắt đầu, giờ kết thúc, thời lượng và danh sách sinh viên, rồi phát hành.
5. Sinh viên làm bài; mỗi câu được lưu ngay. Hết giờ hệ thống tự nộp. Worker chấm bài nền.
6. Giáo viên kiểm tra rồi bấm **Công bố kết quả** (chỉ được khi không còn ai đang làm và mọi bài đã chấm xong).

## Chưa có trong bản này

- S3 (`uniexam-submission-442532936214-ap-southeast-2`) và DynamoDB (`uniexam-metadata`) đã tạo trên AWS nhưng code chưa dùng.
- Chưa có script backup PostgreSQL tự động.
- Chưa có refresh token, email thông báo, giám sát thi bằng camera.
