# UniExam production deployment

## Topology

`uniexam-public` (AWS EC2, public IP `13.211.215.60`, WireGuard `10.200.0.1`) runs Nginx/TLS, the React frontend, and `public-api` on container port `4000`.

`uniexam-private` (OpenStack, management floating IP `172.24.4.252`, fixed IP `10.0.0.54`, WireGuard `10.200.0.2`) runs `private-api` on `8080` and `grading-worker` health on `8081`. PostgreSQL and Redis remain managed by the existing `/srv/uniexam/compose.yml` on this host.

Nginx routes `/api/` to `public-api:4000` and `/exam-api/` through WireGuard to `10.200.0.2:8080`. The browser never calls the private address directly. `public-api` still uses the shared PostgreSQL database for login, administration, and result routes, but does not run the lifecycle loop. The lifecycle loop and grading worker run on the private host.

AWS S3 bucket `uniexam-submission-442532936214-ap-southeast-2` and DynamoDB table `uniexam-metadata` are external AWS services. Access should use the attached IAM role `uniexam-ec2-role`; do not put access keys in `.env`. The current Python application does not yet contain S3/DynamoDB client code, so those services are infrastructure prepared for the next storage/synchronization implementation.

## Files

`backend/compose.public.yaml` is the public-host stack. `backend/compose.private.yaml` is the private application stack. `docker-compose.yml` and `backend/compose.yaml` remain public-stack compatibility entry points. `backend/node/compose.yaml` is the legacy Node stack and must not be started with the Python stack.

## Cổng AWS cần mở

Không cần mở cổng `4000` ra Internet. Trong public stack, `public-api` chỉ bind vào `127.0.0.1:4000` và frontend/Nginx gọi nó qua Docker network. Internet chỉ cần đi vào frontend trên `80/443` (hoặc host Nginx/TLS trên `443`). SSH `22` chỉ nên cho phép từ IP quản trị.

Trên private host, chỉ cho phép `8080` và `8081` từ peer WireGuard `10.200.0.1`; không mở các cổng này ra Internet. PostgreSQL `5432` và Redis `6379` chỉ cho private host/container cần thiết truy cập.

## Trình tự deploy

1. Trên cả hai máy cài Docker Engine, Docker Compose plugin và WireGuard. Xác nhận public gọi được `ping 10.200.0.2` và sau khi private chạy, `curl http://10.200.0.2:8080/health`. `grading-worker` chạy worker chấm bài thật trong cùng process Uvicorn với health endpoint `8081`; không cần thêm cổng hoặc service riêng.
2. Trên private khởi động data stack `/srv/uniexam/compose.yml` trước, rồi tạo `.env` từ `.env.private.example`, điền URL DB/Redis thật và hai secret production.
3. Trên public tạo `.env` từ `.env.public.example`, dùng đúng hai secret như private, domain HTTPS thật và các địa chỉ database/Redis có thể truy cập.
4. Chạy `config` trước, sau đó `up -d --build --wait`; kiểm tra health, đăng nhập, tạo kỳ thi, nộp bài và kiểm tra grading. Sao lưu PostgreSQL trước migration.

## Deploy public host

```bash
cp .env.public.example .env
docker compose --env-file .env -f docker-compose.yml config
docker compose --env-file .env -f docker-compose.yml up -d --build --wait
```

The public `.env` must point `DATABASE_URL` and `REDIS_URL` to services reachable over the private network, use the same `JWT_SECRET` and `INTERNAL_API_KEY` as the private stack, and set the real HTTPS origin in `CORS_ORIGINS`.

## Deploy private host

First keep the existing data compose running at `/srv/uniexam/compose.yml`. Then from a checkout of this repository:

```bash
cp .env.private.example .env
docker compose --env-file .env -f backend/compose.private.yaml config
docker compose --env-file .env -f backend/compose.private.yaml up -d --build --wait
```

The private `.env` must use the actual PostgreSQL and Redis hostnames reachable from the private compose network. Use exactly the same `JWT_SECRET` and `INTERNAL_API_KEY` as the public host. Do not expose PostgreSQL `5432` or Redis `6379` to the Internet. Allow private-api `8080` only from WireGuard peer `10.200.0.1/32`.

## Nginx/TLS

The container Nginx listens on port 80 and is intended to sit behind the host-level TLS reverse proxy, or to be published by the host Nginx on `127.0.0.1:8080`. Configure the host Nginx/Certbot for the real domain and proxy to `127.0.0.1:8080`. WireGuard must be up before the frontend container is started so `/exam-api/` can reach `10.200.0.2:8080`.

## Verification

```bash
docker compose --env-file .env -f docker-compose.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:4000/health

# On uniexam-public, after WireGuard and private stack are up:
curl -fsS http://10.200.0.2:8080/health
curl -fsS http://10.200.0.2:8081/health
```

A successful `private-api` health response proves database connectivity. A successful worker health response proves both private-api and Redis connectivity. A successful frontend `/health` response proves Nginx is serving the application; test `/api/health` and `/exam-api/health` through the public HTTPS domain to verify both proxy paths.
