# Triển khai UniExam Hybrid Cloud

Hai máy, nối bằng WireGuard (`10.200.0.1` ⇄ `10.200.0.2`). Triển khai **uniexam-private trước**, vì uniexam-public chỉ chuyển tiếp request sang đó.

Hai giá trị **phải giống hệt nhau** ở `.env` của hai máy: `JWT_SECRET` (≥ 32 ký tự) và `INTERNAL_API_KEY` (≥ 16 ký tự). Tạo bằng:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 16   # INTERNAL_API_KEY
```

Không commit file `.env` thật lên git (`.gitignore` đã chặn).

---

## 1. uniexam-private (OpenStack)

Yêu cầu: Docker + Compose plugin, WireGuard `wg0` có IP `10.200.0.2`, ổ Cinder mount tại `/srv/uniexam-data`.

### 1.1 Cho phép Docker bind IP WireGuard khi khởi động máy

`private-api` nghe trên `10.200.0.2:8080`. Nếu Docker khởi động trước `wg0`, container sẽ không bind được IP này. Bật một lần:

```bash
echo 'net.ipv4.ip_nonlocal_bind=1' | sudo tee /etc/sysctl.d/99-uniexam.conf
sudo sysctl --system
```

### 1.2 Data stack: PostgreSQL + Redis

File `/srv/uniexam/compose.yml` (ngoài repo) chạy `uniexam-postgres` (postgres:16-alpine) và `uniexam-redis` (redis:7-alpine, `--appendonly yes`), dữ liệu bind mount vào `/srv/uniexam-data/postgres` và `/srv/uniexam-data/redis`, cùng mạng Docker `uniexam-internal`. Không publish cổng 5432/6379.

```bash
cd /srv/uniexam
docker compose --env-file .env -f compose.yml up -d
```

### 1.3 App stack: private-api + grading-worker

```bash
git clone https://github.com/BuiMinhHoa11/Hybrid-Application.git ~/Hybrid-Application
cd ~/Hybrid-Application/UniExam-Demo
cp .env.private.example .env && nano .env      # điền mật khẩu Postgres, JWT_SECRET, INTERNAL_API_KEY, domain
ln -s ../.env backend/.env                      # compose đọc .env cạnh file compose

docker build -f backend/Dockerfile -t uniexam-backend:latest .   # VM yếu có thể mất rất lâu
docker compose -f backend/compose.private.yaml config --quiet && echo CONFIG_OK
```

Tạo bảng trên database **mới** (chỉ một lần):

```bash
docker compose -f backend/compose.private.yaml run --rm private-api python -m uniexam.cli init-db
```

Bật app (không build lại, không chờ healthcheck):

```bash
docker compose -f backend/compose.private.yaml up -d --no-build
```

Trên VM 1 vCPU / 2 GB chạy lồng trong VirtualBox, app cần 5–10 phút để khởi động. Healthcheck của Docker đã tắt trong `compose.private.yaml` vì trên máy chậm nó bị treo chồng chất; dùng script giám sát ở mục 1.5.

`compose.private.yaml` gắn đè `grading.py`, `exam_app.py`, `worker.py` từ thư mục repo vào container (khối `volumes`). Nhờ vậy sửa code Python chỉ cần `docker compose -f backend/compose.private.yaml restart <service>`, không phải build lại image. Nếu image đã build từ đúng code này, các dòng `volumes` đó vô hại.

### 1.4 Tạo admin đầu tiên

```bash
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli create-admin admin
```

### 1.5 Giám sát

```bash
cp backend/scripts/healthcheck-private.sh /srv/uniexam/healthcheck.sh
chmod +x /srv/uniexam/healthcheck.sh
(crontab -l 2>/dev/null; echo '*/5 * * * * flock -n /tmp/uniexam-health.lock /srv/uniexam/healthcheck.sh') | crontab -
tail -20 /srv/uniexam/health.log
```

Script gọi `/health` 5 phút một lần, restart container sau 3 lần lỗi liên tiếp, bỏ qua 20 phút đầu sau khi container bật.

### 1.6 Kiểm tra

```bash
curl -s http://10.200.0.2:8080/health    # {"status":"ok",...,"database":"ok"}
curl -s http://127.0.0.1:8081/health     # {"status":"ok",...,"private-api":"ok","redis":"ok"}
sudo ss -ltnp | grep -E ':(8080|8081|5432|6379)\b'
# đúng: 8080 chỉ trên 10.200.0.2, 8081 chỉ trên 127.0.0.1, không có 5432/6379
```

### 1.7 Cập nhật code và database

Code Python được gắn thẳng từ thư mục repo vào container (khối `volumes` trong `compose.private.yaml`), nên **không phải build lại image** khi sửa code:

```bash
cd ~/Hybrid-Application && git fetch origin && git reset --hard origin/main
cd UniExam-Demo
docker compose -f backend/compose.private.yaml up -d --no-build      # tạo lại container nếu compose/.env đổi
docker compose -f backend/compose.private.yaml restart                 # chỉ đổi code Python
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli init-db   # khi có migration mới
```

Chỉ khi đổi `requirements.lock.txt` hoặc `Dockerfile` mới phải build lại image. Build trên VM private rất lâu, nên build trên EC2 rồi chuyển sang (`docker save` → tải qua WireGuard → `docker load`). Image cũ chưa có Pillow vẫn chạy được: ảnh câu hỏi khi đó chỉ được kiểm tra định dạng và dung lượng.

### 1.8 Email lịch thi (tùy chọn)

Khi giáo viên phát hành kỳ thi, `private-api` gửi email lịch thi cho sinh viên có email (nếu có hẹn giờ công bố thì gửi vào giờ đó). Hàng đợi nằm ở bảng `email_notifications`; SMTP lỗi thì thử lại tối đa 3 lần.

1. Thêm khối `EMAIL_*`/`SMTP_*` vào `.env` (mẫu trong `.env.private.example`). Gmail cần **mật khẩu ứng dụng** 16 ký tự (bật xác minh 2 bước trước). Amazon SES: xác minh email/domain gửi đi, tạo SMTP credentials; ở chế độ sandbox chỉ gửi được tới địa chỉ đã xác minh.
2. Tạo lại container để nhận biến môi trường mới, áp migration, rồi gửi thử:

```bash
docker compose -f backend/compose.private.yaml up -d --no-build
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli init-db
docker compose -f backend/compose.private.yaml exec private-api python -m uniexam.cli send-test-email <email-của-bạn>
```

3. Admin nhập email cho sinh viên ở trang **Quản lý tài khoản**. Sinh viên không có email sẽ không nhận thông báo.

Xem tình trạng gửi: `SELECT status, count(*) FROM email_notifications GROUP BY status;` (`failed` có lý do ở cột `last_error`).

### 1.9 Làm bài và nộp bài khi mất mạng

Không cần cấu hình thêm (migration `0006_offline_submit`, áp bằng `init-db`).

- Mất mạng giữa giờ thi: sinh viên vẫn làm tiếp; đề và đáp án giữ trong `localStorage` (tải lại trang vẫn còn). Có mạng lại thì đáp án tự gửi lên.
- Bấm **Nộp bài** hoặc **hết giờ** khi vẫn mất mạng: máy **khóa bài** (không sửa được nữa) và tự gửi **toàn bộ bài** khi có mạng lại, kể cả sau giờ hết hạn. Server thay bài đã bị tự nộp lúc hết giờ bằng bài đầy đủ này rồi chấm lại.
- Server nhận bài gửi muộn tối đa `OFFLINE_SUBMIT_GRACE_MINUTES` phút sau giờ hết hạn (mặc định 30; đặt trong `.env`, `0` = tắt). Trong khoảng đó, nếu kỳ thi có bài bị tự nộp do hết giờ thì giáo viên chưa công bố được kết quả, để không bỏ sót bài của người đang mất mạng.
- Nếu lúc gửi mà OpenStack đang sập, gateway EC2 giữ tạm bài (đã mã hóa) trên S3 và tự chuyển về sau (mục 2.6).
- Giáo viên thấy nhãn **Nộp ngoại tuyến** ở trang kết quả, kèm thời gian mất kết nối và số phút gửi trễ, để soát lại khi cần.
- Giới hạn: sinh viên phải quay lại **đúng máy, đúng trình duyệt** (không xóa dữ liệu trình duyệt, không dùng cửa sổ ẩn danh rồi đóng). Thời gian làm bài lúc mất mạng do đồng hồ trên máy tính, nên giáo viên cần soát các bài có nhãn trên.

### 1.10 Cảnh báo thoát toàn màn hình cho quản trị viên

Migration `0005_admin_exam_alerts` (áp bằng `init-db`). Admin đang mở web nhận thông báo nổi khi sinh viên thoát toàn màn hình; mục **Cảnh báo** liệt kê ai đang ở ngoài toàn màn hình và lịch sử 50 cảnh báo gần nhất. Luồng dữ liệu là SSE qua `/api/admin/exam-alerts/stream`, nên Nginx trên EC2 phải tắt buffering cho đường dẫn này (mục 2.4).

## 2. uniexam-public (AWS EC2)

Security group: TCP 80, 443 (Internet), UDP 51820 (WireGuard), TCP 22 (chỉ IP quản trị). Không mở 4000 hay 8080.

### 2.1 Kiểm tra WireGuard tới private

```bash
ping -c 3 10.200.0.2
curl -s -m 30 http://10.200.0.2:8080/health      # phải trả "ok"
curl -s -m 5  http://10.200.0.2:8081/health      # phải LỖI (worker không lộ ra ngoài)
```

### 2.2 Cho phép Docker bind IP WireGuard

`public-api` và `frontend` nghe thêm trên `10.200.0.1` để private-api hiển thị đúng trạng thái trên trang `/admin/system-status`.

```bash
echo 'net.ipv4.ip_nonlocal_bind=1' | sudo tee /etc/sysctl.d/99-uniexam.conf
sudo sysctl --system
```

### 2.3 Chạy public stack

```bash
git clone https://github.com/BuiMinhHoa11/Hybrid-Application.git ~/Hybrid-Application
cd ~/Hybrid-Application/UniExam-Demo
cp .env.public.example .env && nano .env      # JWT_SECRET, INTERNAL_API_KEY giống private; CORS_ORIGINS=https://<domain>
docker compose --env-file .env -f backend/compose.public.yaml config --quiet && echo CONFIG_OK
docker compose --env-file .env -f backend/compose.public.yaml up -d --build --wait
```

`public-api` không cần `DATABASE_URL`/`REDIS_URL` và không chạy migration.

### 2.4 Nginx + HTTPS trên máy EC2

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# Luồng cảnh báo admin (SSE): phải tắt buffering, nếu không cảnh báo bị giữ lại không tới ngay.
sudo tee /etc/nginx/snippets/uniexam-sse.conf >/dev/null <<'NGINX'
location = /api/admin/exam-alerts/stream {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 60s;
}
NGINX
sudo tee /etc/nginx/sites-available/uniexam >/dev/null <<'NGINX'
server {
    listen 80;
    server_name uniexam.publicvm.com;
    client_max_body_size 10m;
    include snippets/uniexam-sse.conf;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/uniexam /etc/nginx/sites-enabled/uniexam
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d uniexam.publicvm.com
```

Máy đã cài từ trước (file đã được certbot sửa): tạo file `snippets/uniexam-sse.conf` như trên, rồi thêm dòng `include` vào trước mọi `location / {`:

```bash
grep -q uniexam-sse /etc/nginx/sites-available/uniexam || \
  sudo sed -i 's#^\(\s*\)location / {#\1include snippets/uniexam-sse.conf;\n\1location / {#' /etc/nginx/sites-available/uniexam
sudo nginx -t && sudo systemctl reload nginx
```

### 2.5 Kiểm tra

```bash
curl -s http://127.0.0.1:8080/health                       # ok  (frontend)
curl -s http://127.0.0.1:4000/health                       # "status":"ok", "private-api":"ok"
curl -s https://uniexam.publicvm.com/api/health            # qua gateway
curl -s https://uniexam.publicvm.com/exam-api/health       # thẳng private-api
```

Sau đó mở `https://uniexam.publicvm.com`, đăng nhập admin, vào **Trạng thái hệ thống**: database, public-api, private-api, grading-worker, frontend đều phải **up**.

---

### 2.6 Giữ tạm bài nộp trên S3 khi OpenStack sập

Chỉ dùng khi có sự cố. Bình thường bài nộp đi thẳng về private-api và **S3 không có dữ liệu nào**.

- Sinh viên nộp bài (kể cả bài nộp lúc mất mạng) mà private-api không trả lời: gateway trên EC2 **mã hóa AES-256-GCM** bài làm rồi lưu vào `s3://uniexam-submission-442532936214-ap-southeast-2/offline-buffer/`, trả cho sinh viên thông báo "đã nộp, lưu tạm an toàn". Sinh viên có thể đóng trình duyệt.
- Khóa mã hóa (`OFFLINE_BUFFER_KEY`) chỉ nằm trong `.env` của EC2, không nằm trên S3. Trên S3 chỉ có dữ liệu không đọc được.
- Cứ 30 giây gateway thử chuyển bài về private-api (`/internal/offline-relay`, xác thực bằng `INTERNAL_API_KEY`). Private chạy lại thì bài được ghi vào PostgreSQL, chấm lại, và **xóa khỏi S3**. Mốc thời gian dùng để xét hạn nộp là lúc gateway nhận bài, không phải lúc OpenStack khôi phục.
- Bài bị private từ chối (đã công bố kết quả, quá hạn...) được chuyển sang `offline-buffer-rejected/` (vẫn mã hóa) để xử lý tay, không mất.

**Cài đặt một lần:**

1. **IAM role cho EC2.** IAM → Roles → *Create role* → Trusted entity: **AWS service / EC2** → bỏ qua bước chọn policy → đặt tên `uniexam-ec2-role` → *Create role*. Mở role vừa tạo → *Add permissions → Create inline policy* → tab **JSON**, dán rồi đặt tên `UniExamOfflineBuffer`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::uniexam-submission-442532936214-ap-southeast-2/offline-buffer/*",
        "arn:aws:s3:::uniexam-submission-442532936214-ap-southeast-2/offline-buffer-rejected/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::uniexam-submission-442532936214-ap-southeast-2",
      "Condition": { "StringLike": { "s3:prefix": ["offline-buffer/*"] } }
    }
  ]
}
```

   (EC2 đã có role từ trước thì chỉ cần thêm inline policy này vào role đó.)

2. **Gắn role vào EC2 và cho container dùng được.** EC2 → Instances → chọn `uniexam-public` → *Actions → Security → Modify IAM role* → chọn `uniexam-ec2-role`. Sau đó *Actions → Instance settings → Modify instance metadata options* → **Metadata response hop limit = 2** (container Docker cần thêm 1 bước mạng để lấy quyền từ IAM role).

3. **Khóa mã hóa và `.env` trên EC2:**

```bash
cd ~/Hybrid-Application/UniExam-Demo
openssl rand -base64 32          # in ra khóa, copy lại
nano .env                        # thêm 3 dòng dưới, dán khóa vào OFFLINE_BUFFER_KEY
```

```text
OFFLINE_BUFFER_BUCKET=uniexam-submission-442532936214-ap-southeast-2
OFFLINE_BUFFER_KEY=<khóa vừa tạo>
AWS_REGION=ap-southeast-2
```

   Giữ khóa này cẩn thận: mất khóa thì không giải mã được các bài còn nằm trên S3.

4. **Build lại và kiểm tra quyền S3 từ trong container:**

```bash
docker compose --env-file .env -f backend/compose.public.yaml up -d --build --wait
docker compose --env-file .env -f backend/compose.public.yaml exec public-api python -c "import boto3; print('S3_OK', boto3.client('s3').list_objects_v2(Bucket='uniexam-submission-442532936214-ap-southeast-2', Prefix='offline-buffer/')['KeyCount'])"
```

   Phải in `S3_OK 0`. Lỗi `AccessDenied` hoặc `NoCredentialsError` thì xem lại bước 1–2.

**Thử khi OpenStack sập:**

1. Sinh viên vào làm một kỳ thi.
2. Trên uniexam-private: `docker compose -f backend/compose.private.yaml stop private-api` (giả lập OpenStack sập).
3. Sinh viên chọn đáp án rồi bấm **Nộp bài** → màn hình "Đã nộp bài… lưu tạm an toàn trên máy chủ dự phòng". Trên S3 xuất hiện file `offline-buffer/<mã phiên>.bin`.
4. `docker compose -f backend/compose.private.yaml start private-api`. Trong khoảng 30 giây–1 phút sau khi private-api chạy, file trên S3 biến mất; giáo viên thấy bài với nhãn **Nộp ngoại tuyến**.
5. Xem log gateway: `docker compose --env-file .env -f backend/compose.public.yaml logs --tail 30 public-api`.

## Xử lý nhanh

| Hiện tượng | Kiểm tra |
|---|---|
| Web báo lỗi 502 | WireGuard: `sudo wg show`, `ping 10.200.0.2` từ EC2 |
| Không đăng nhập được dù đúng mật khẩu | `JWT_SECRET`/`INTERNAL_API_KEY` hai máy có giống nhau không |
| Bài nộp mãi "chờ chấm" | `curl 127.0.0.1:8081/health` và `docker logs uniexam-private-app-grading-worker-1` trên private |
| Container không bật sau khi khởi động lại máy | `sysctl net.ipv4.ip_nonlocal_bind` phải là 1 |
