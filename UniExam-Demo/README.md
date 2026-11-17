# UniExam — website thi trực tuyến

Giao diện React dùng backend Python/FastAPI và một database PostgreSQL chung. Admin quản lý tài khoản; giáo viên soạn câu hỏi, tạo đề, hẹn giờ thi và công bố kết quả; sinh viên làm bài và xem điểm sau công bố. Hỗ trợ trắc nghiệm nhiều đáp án và điền vào chỗ trống.

## Cấu trúc mã nguồn

```text
UniExam-Demo/
├── backend/
│   ├── uniexam/                 # FastAPI: tài khoản, câu hỏi, đề, thi, chấm, kết quả
│   ├── contracts/               # Kiểu dữ liệu và hợp đồng API dùng chung
│   ├── node/                    # Backend Node.js cũ và thư viện liên quan
│   ├── scripts/                 # Khởi động và công cụ quản trị
│   ├── Dockerfile
│   └── compose.yaml
├── frontend/
│   ├── src/                     # Giao diện React
│   ├── public/
│   ├── Dockerfile
│   └── nginx.conf
├── database/
│   ├── uniexam_database/        # Schema PostgreSQL và migration Alembic đang dùng
│   ├── node/                    # Schema, migration, seed và thư viện DB Node cũ
│   ├── design/                  # ERD, tài liệu thiết kế và SQL tham khảo
│   └── pyproject.toml           # Đóng gói tài nguyên DB cho backend Python
├── docs/                        # Tài liệu chung
├── docker-compose.yml           # Chạy cả hệ thống
└── package.json
```

Backend tự cài package database từ `../database`. Docker đóng gói cả hai, nên migration hoạt động khi triển khai mà không phụ thuộc đường dẫn trên máy cá nhân.

## Triển khai production tách máy

Mô hình production dùng hai stack, không tạo PostgreSQL hoặc Redis lần thứ hai trên máy ứng dụng:

- Máy dữ liệu `uniexam-private`: giữ `compose.yml` hiện có trong `/srv/uniexam`, gồm PostgreSQL và Redis.
- Máy ứng dụng: chạy `docker-compose.yml` của repository này, gồm `public-api`, `private-api`, `grading-worker` và frontend.

Không cần thêm compose mới cho `uniexam-private`. File `/srv/uniexam/compose.yml` là compose dữ liệu; file `docker-compose.yml` trong repository này là compose ứng dụng. `backend/node/compose.yaml` là stack Node.js cũ, không chạy cùng stack Python.

Trên máy dữ liệu, giữ compose hiện có và tạo `.env` chứa `POSTGRES_PASSWORD`. Redis trong compose hiện tại chưa bật mật khẩu, nên `REDIS_URL` bên máy ứng dụng dùng `redis://<private-host>:6379/0`. Nếu bật Redis AUTH, phải cập nhật đồng thời `command` trong compose dữ liệu và `REDIS_URL`. Chỉ cho phép private IP của máy ứng dụng truy cập cổng 5432/6379; không mở các cổng này ra Internet.

Trên máy ứng dụng, sao chép file mẫu rồi điền private DNS/IP của máy dữ liệu và secret production:

```bash
cp .env.example .env
# sửa DATABASE_URL, REDIS_URL, JWT_SECRET, INTERNAL_API_KEY,
# CORS_ORIGINS và các giá trị <...>
docker compose --env-file .env config
docker compose --env-file .env up -d --build --wait
```

`public-api` chạy migration bằng `python -m uniexam.cli init-db` trước khi mở cổng. API chỉ bind vào `127.0.0.1`; reverse proxy TLS trên máy ứng dụng chuyển traffic vào frontend ở `127.0.0.1:8081`. Frontend gọi `/api` và `/exam-api` qua Nginx cùng container, không cần công khai các cổng API riêng.

| Thành phần | Vị trí production |
|---|---|
| Website | reverse proxy TLS → `127.0.0.1:8081` |
| PostgreSQL | máy dữ liệu, private network, cổng 5432 |
| Redis | máy dữ liệu, private network, cổng 6379 |
| API và worker | nội bộ máy ứng dụng |

## Chạy website

Mở Docker Desktop, chạy tại thư mục dự án:

```powershell
cd D:\project\UniExam-Demo
npm start
```

Mở **http://localhost:8081**. Lệnh tự tìm Docker Desktop trên Windows kể cả khi terminal chưa cập nhật PATH. Không cần cài Python hoặc npm install nếu chỉ chạy Docker và đã có Node.js.

Nếu Docker đã có trong PATH, có thể dùng trực tiếp:

```powershell
docker compose up --build -d --wait
```

Cấu hình gốc đọc chung `backend/compose.yaml`, giữ tên project `uniexam-python` và volume `uniexam-python_python_pgdata`. Chạy từ gốc hoặc từ `backend` đều dùng cùng một hệ thống. Cấu hình Node.js cũ được giữ trong `backend/node/compose.yaml` để tham khảo; luồng chạy mặc định đã dùng Python.

| Thành phần | Địa chỉ |
|---|---|
| Website | http://localhost:8081 |
| Tài liệu API quản lý | http://localhost:4100/docs |
| Tài liệu API làm bài | http://localhost:4101/docs |
| Kiểm tra worker | http://localhost:4102/health |
| PostgreSQL | localhost:5433, database `uniexam_python` |

Frontend gọi `/api` và `/exam-api` qua Nginx trên cùng địa chỉ website. API khởi động sau migration và kiểm tra database; worker và frontend chờ API sẵn sàng. Nginx cập nhật địa chỉ container khi API khởi động lại.

## Tài khoản và mật khẩu

Đăng nhập bằng tài khoản đang có trong database. Sửa mật khẩu trong file seed không cập nhật tài khoản đã tồn tại.

Admin vào **Quản lý tài khoản → Tạo tài khoản** để thêm giáo viên, sinh viên hoặc quản trị viên; **Cập nhật** để đổi thông tin/mật khẩu. Mật khẩu tạo/đổi cần 8–200 ký tự.

Khi cần đổi mật khẩu quản trị mà không đăng nhập được:

```powershell
npm run change-password -- admin
```

Lệnh yêu cầu nhập mật khẩu mới hai lần và ẩn nội dung. Đổi trực tiếp tài khoản hiện có, không cần sửa seed hoặc build lại website.

Trên máy mới chưa có tài khoản, tạo admin riêng:

```powershell
npm run create-admin -- quantri --name "Quản trị viên"
```

Hoặc chạy `npm run seed` để thêm demo theo cấu hình trong `backend/uniexam/cli.py`. Seed không đặt lại mật khẩu đã tồn tại; không tự chạy mỗi lần khởi động.

## Quy trình sử dụng

1. Admin tạo tài khoản giáo viên và sinh viên.
2. Giáo viên vào Ngân hàng câu hỏi, nhập câu trắc nghiệm hoặc điền khuyết cùng đáp án và điểm.
3. Tạo đề: chọn câu thủ công, nhập thêm ngay trên web hoặc chọn tự động theo chương/chủ đề/độ khó. Xem lại rồi lưu; đề giữ bản sao câu hỏi tại thời điểm tạo.
4. Tạo kỳ thi, chọn đề, giờ bắt đầu/kết thúc, thời lượng và mã sinh viên dự thi. Có thể hẹn thời điểm đề hiển thị; sinh viên chỉ bắt đầu từ giờ thi.
5. Sinh viên làm bài, tự lưu đáp án, nộp bài. Hết giờ hệ thống tự nộp và worker chấm bài.
6. Giáo viên kiểm tra rồi bấm **Công bố kết quả**. Được công bố sớm khi mọi thí sinh đã nộp và chấm xong. Nếu có thí sinh vắng, đợi hết giờ; hệ thống không tự công bố điểm.

## Vận hành và dữ liệu

```powershell
npm run status
npm run logs
npm run stop
npm start
```

`stop` giữ dữ liệu. Đổi cổng/cấu hình bằng cách sao chép `.env.example` ở gốc thành `.env` rồi chỉnh trước khi chạy. Nên quản lý cấu hình ở gốc, tránh giữ hai file `.env` có giá trị khác nhau ở gốc và `backend`.

Khi chạy production hybrid, PostgreSQL và Redis nên chạy trên máy dữ liệu có volume bền vững; `public-api`, `private-api`, `grading-worker` và frontend chạy trên máy ứng dụng. Các API kết nối tới database/Redis qua mạng riêng, không công khai cổng PostgreSQL hoặc Redis ra Internet. Trước khi đưa traffic vào hệ thống, đặt reverse proxy TLS ở phía trước frontend, thay toàn bộ secret mặc định, giới hạn `CORS_ORIGINS`, cấu hình backup PostgreSQL và kiểm tra endpoint health của cả ba service backend. Worker dùng Redis Streams để nhận tín hiệu nhưng PostgreSQL vẫn là nguồn dữ liệu chuẩn; nếu Redis tạm thời gián đoạn, worker có cơ chế reconciliation qua private API.

Dữ liệu Node cũ trên máy này đã nhập sang Python. Sau khi gộp: 7 tài khoản, 13 câu hỏi, 3 đề thi, 3 kỳ thi, 2 bài nộp và 2 kết quả chấm. Tài khoản trùng tên giữ mật khẩu bản Python. Database nguồn giữ nguyên; backup trước khi nhập nằm trong `backups/`, được bỏ qua bởi Git/Docker build.

Công cụ nhập có dry-run, transaction toàn bộ, kiểm tra xung đột, giữ hash bcrypt cho tài khoản nhập mới. Đây là chuyển dữ liệu một chiều, không đồng bộ hai database sau mỗi lần sửa. Xem [hướng dẫn chuyển dữ liệu](backend/IMPORT-LEGACY.md).

## Phát triển

Cần Node.js 20+, Python 3.11+ và uv khi phát triển ngoài Docker.

```powershell
npm ci
uv sync --project backend
npm run typecheck
```

Kiểm thử mới và các thay đổi kiểm thử được giữ tại máy phát triển, không nằm trong lần cập nhật này.

Bản hiện tại chạy local. Khi đưa lên máy chủ thật, cần HTTPS, khóa JWT/nội bộ riêng, backup và kiểm thử tải. Chưa có refresh token, email thông báo hoặc giám sát thi bằng camera.
