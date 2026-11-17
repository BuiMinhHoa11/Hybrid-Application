# UniExam backend Python

Backend FastAPI cho ngân hàng câu hỏi, đề thi, kỳ thi, làm bài và công bố kết quả. Schema và migration nằm riêng tại `../database/uniexam_database/`, tương ứng bản thiết kế `../database/design/schema-proposal.sql`. Backend dùng package `uniexam-database` để đọc tài nguyên này khi chạy local hoặc trong Docker.

## Chạy bằng Docker

Production chạy stack ứng dụng trên máy app; PostgreSQL và Redis chạy riêng trên máy dữ liệu `uniexam-private`. Mở PowerShell trên thư mục gốc repository:

```powershell
cd D:\project\UniExam-Demo
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# điền DATABASE_URL, REDIS_URL và secrets production trong .env
docker compose --env-file .env config
docker compose --env-file .env up --build -d --wait
```

Không chạy thêm PostgreSQL/Redis từ compose ứng dụng; chỉ cho phép app host truy cập private network của data host.

Phần dưới chỉ mô tả luồng phát triển/local cũ. Không chạy `seed-demo` trên production:

```powershell
# local development only, with DATABASE_URL/REDIS_URL trỏ tới data services phát triển
cd D:\project\UniExam-Demo
npm run dev:public-api
```

| Dịch vụ | Địa chỉ |
|---|---|
| Giao diện React | http://localhost:8081 |
| Swagger API quản lý | http://localhost:4100/docs |
| Swagger API làm bài | http://localhost:4101/docs |
| Health worker | http://localhost:4102/health |
| PostgreSQL/Redis | máy dữ liệu `uniexam-private`, private network |

Compose có project name `uniexam-python`; `docker-compose.yml` ở thư mục gốc dùng chung cấu hình application stack. Database và Redis không có volume trong stack này vì chúng nằm trên máy dữ liệu. Đường dẫn qua Nginx là `/api` và `/exam-api`; JSON dùng camelCase cho giao diện React.

`public-api` chạy Alembic trước khi phục vụ yêu cầu. Private API chờ migration và public API khỏe; frontend chờ hai API. Nginx tự cập nhật DNS khi container API đổi địa chỉ.

Tài khoản khi chạy seed trên database mới:

| Vai trò | Tên đăng nhập | Mật khẩu demo |
|---|---|---|
| Quản trị viên | admin | Theo giá trị hiện có trong `seed_demo()` ở `uniexam/cli.py` |
| Giáo viên | gv01 | Theo giá trị hiện có trong `seed_demo()` ở `uniexam/cli.py` |
| Sinh viên | sv001, sv002 | Theo giá trị hiện có trong `seed_demo()` ở `uniexam/cli.py` |

Seed tạo một đề trắc nghiệm kết hợp điền khuyết và một kỳ thi nháp. Giáo viên kiểm tra thời gian, đối tượng dự thi rồi phát hành. Seed không thay mật khẩu tài khoản đã tồn tại và từ chối tên trùng khác vai trò. Không dùng tài khoản demo cho production.

Xem log và dừng dịch vụ:

```powershell
docker compose logs -f --tail=100 public-api private-api grading-worker
docker compose down
```

## Chạy để phát triển

Cần Python 3.11 trở lên và uv. Bộ dependency đã khóa trong `uv.lock`; file `requirements.lock.txt` dùng cho Docker.

```powershell
uv sync
# trỏ DATABASE_URL/REDIS_URL tới data services phát triển
uv run python -m uniexam.cli init-db
uv run python -m uniexam.cli seed-demo
```

Mở ba terminal, cùng ở thư mục `backend`:

```powershell
uv run uvicorn uniexam.public_app:app --port 4100 --reload
```

```powershell
uv run uvicorn uniexam.exam_app:app --port 4101 --reload
```

```powershell
uv run uvicorn uniexam.worker:health_app --port 4102
```

Nếu phát triển giao diện bằng Vite ở máy host, proxy mặc định đã trỏ Python ở cổng 4100/4101. Có thể ghi đè URL khi thay cổng:

```powershell
cd ..
$env:PUBLIC_API_URL='http://localhost:4100'
$env:PRIVATE_API_URL='http://localhost:4101'
npm run dev:frontend
```

Tạo quản trị viên riêng, mật khẩu nhập qua prompt ẩn:

```powershell
uv run python -m uniexam.cli create-admin ten_quan_tri --name "Quản trị viên"
```

## Các nhóm chức năng đã triển khai

| Nhóm | File chính | Chức năng |
|---|---|---|
| Đăng nhập và tài khoản | `routers/accounts.py`, `security.py` | JWT, mật khẩu Argon2, đọc hash bcrypt cũ, phân quyền, tạo/sửa/khóa tài khoản, bảo vệ quản trị cuối cùng |
| Ngân hàng câu hỏi | `routers/questions.py` | CRUD, tìm/lọc/phân trang, trắc nghiệm nhiều đáp án và điền khuyết |
| Đề thi | `routers/papers.py` | Bản chụp cố định, sắp thứ tự, tổng điểm, tạo đề tự động theo điều kiện |
| Kỳ thi | `routers/exams.py` | Lưu nháp, chỉ định thí sinh, kiểm tra điều kiện, hẹn giờ công bố và phát hành |
| Làm bài | `routers/sessions.py` | Một phiên mỗi kỳ thi, đề không lộ đáp án, autosave, đánh dấu xem lại, nộp một lần và tự nộp khi hết giờ |
| Chấm bài | `routers/grading.py`, `grading_core.py`, `worker.py` | Hàng đợi PostgreSQL, khóa SKIP LOCKED, lease/retry, chấm bằng Decimal, kiểm tra kết quả theo barem |
| Kết quả | `routers/results.py`, `services/results_policy.py` | Thống kê, xem bài, ẩn điểm trước công bố, công bố sớm do giáo viên xác nhận |
| Vòng đời | `services/exam_lifecycle.py` | Tự mở, khóa, nộp và đóng kỳ thi; không tự công bố điểm |

## Quy tắc công bố kết quả

- Giáo viên hoặc quản trị viên có quyền bấm Công bố kết quả và xác nhận.
- Công bố sớm khi mọi thí sinh trong danh sách đã nộp, không còn phiên đang làm và tất cả bài có kết quả chấm.
- Nếu có người vắng, đợi đến hết giờ và không còn phiên đang làm; các bài thực tế nộp phải chấm xong.
- Công bố đóng kỳ thi, lưu thời điểm/người công bố. Không có thao tác thu hồi trong phiên bản này.
- Chưa công bố: API sinh viên trả điểm null và không trả đáp án đúng.

## Tổ chức dữ liệu và transaction

`db.py` dùng SQLAlchemy Session và các truy vấn Core có tham số. DTO/Pydantic nằm cạnh router; quy tắc tính điểm và công bố được tách riêng. Schema SQL là nguồn tạo bảng, khóa ngoại ghép và CHECK; Alembic quản lý phiên bản.

Dependency database dùng `scope="function"` để commit thành công trước khi trả phản hồi. Lưu đáp án khóa SHARE phiên; nộp bài khóa UPDATE; bắt đầu phiên khóa SHARE kỳ thi và công bố khóa UPDATE kỳ thi. Bài nộp giữ snapshot, không chấm từ dữ liệu autosave đang thay đổi.

Điền khuyết lưu riêng `accepted_answers` và `text_answer`. API vẫn nhận `selectedOptionIds: ["văn bản"]` từ giao diện cũ, đồng thời hỗ trợ `textAnswer`. Chấm bỏ khác biệt hoa/thường, khoảng trắng thừa và dạng Unicode, nhưng giữ phân biệt dấu tiếng Việt.

## API chấm nội bộ

Mọi route `/grading` yêu cầu header `X-Internal-Api-Key`.

- `POST /grading/claim`: body `{ "workerId": "worker-1" }`, trả bài hoặc HTTP 204.
- Claim chứa `attempt` và `claimToken` HMAC. Worker gửi cùng workerId/attempt/claimToken khi ghi điểm hoặc báo lỗi.
- `POST /grading/{id}/result`: điểm tổng, điểm tối đa và chi tiết đầy đủ các câu hỏi. API kiểm tra barem và tổng điểm.
- `POST /grading/{id}/fail`: trả về hàng đợi hoặc đánh dấu thất bại khi hết lượt.
- Lease 5 phút, tối đa 5 lần. Token gắn với bài, worker và lượt nhận; kết quả cũ/hết hạn bị từ chối.

Chỉ worker Python của bản này dùng giao thức claim mới; không trộn worker Node cũ vào cổng chấm Python.

## Phạm vi triển khai

Bản Python có schema riêng. Đã có công cụ chuyển dữ liệu một chiều từ Node, xem [IMPORT-LEGACY.md](IMPORT-LEGACY.md); không trỏ DATABASE_URL Python vào database Node cũ rồi chạy init-db. Công cụ hỗ trợ dry-run, ghép tài khoản trùng tên khi chọn rõ, giữ mật khẩu đích và từ chối ghi đè dữ liệu khác nhau.

Khi triển khai production: đặt ENVIRONMENT=production, JWT_SECRET tối thiểu 32 ký tự ngẫu nhiên và INTERNAL_API_KEY riêng; thêm HTTPS, giới hạn đăng nhập, sao lưu/khôi phục và kiểm thử tải theo môi trường thực tế. Bản này chưa triển khai refresh token, chống gian lận bằng camera hay gửi email thông báo.
