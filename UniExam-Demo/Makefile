.PHONY: up down logs migrate seed

# Build và chạy React + Python + PostgreSQL. Giao diện: http://localhost:8081
up:
	docker compose up --build -d --wait

down:
	docker compose stop

logs:
	docker compose logs -f --tail=100

# Migration thường chạy tự động khi public-api khởi động; lệnh này để chạy thủ công.
migrate:
	docker compose exec public-api python -m uniexam.cli init-db

# Nạp demo khi cần; không đặt lại mật khẩu đã tồn tại.
seed:
	docker compose exec public-api python -m uniexam.cli seed-demo
