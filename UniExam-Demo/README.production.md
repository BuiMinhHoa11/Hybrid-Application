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

---

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
sudo tee /etc/nginx/sites-available/uniexam >/dev/null <<'NGINX'
server {
    listen 80;
    server_name uniexam.publicvm.com;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/uniexam /etc/nginx/sites-enabled/uniexam
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d uniexam.publicvm.com
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

## Xử lý nhanh

| Hiện tượng | Kiểm tra |
|---|---|
| Web báo lỗi 502 | WireGuard: `sudo wg show`, `ping 10.200.0.2` từ EC2 |
| Không đăng nhập được dù đúng mật khẩu | `JWT_SECRET`/`INTERNAL_API_KEY` hai máy có giống nhau không |
| Bài nộp mãi "chờ chấm" | `curl 127.0.0.1:8081/health` và `docker logs uniexam-private-app-grading-worker-1` trên private |
| Container không bật sau khi khởi động lại máy | `sysctl net.ipv4.ip_nonlocal_bind` phải là 1 |
