from typing import Literal
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://uniexam:uniexam@localhost:5433/uniexam_python"
    jwt_secret: str = "dev-only-python-secret-change-before-production-12345"
    jwt_lifetime_hours: int = Field(default=8, ge=1, le=168)
    internal_api_key: str = "dev-python-internal-key-change-me"
    cors_origins: str = "http://localhost:8081,http://localhost:5173"
    private_api_url: str = "http://localhost:4101"
    public_api_url: str = "http://localhost:4100"
    frontend_url: str = "http://localhost:8081"
    worker_url: str = "http://localhost:4102"
    redis_url: str = "redis://localhost:6379/0"
    grading_queue_name: str = "uniexam:grading"
    grading_queue_group: str = "grading-workers"
    grading_poll_seconds: float = Field(default=2, gt=0)
    # Đối soát qua database (phòng khi Redis mất việc) — không cần chạy mỗi vòng; VM private rất chậm.
    grading_reconcile_seconds: float = Field(default=60, gt=0)
    lifecycle_interval_seconds: float = Field(default=5, gt=0)
    lifecycle_enabled: bool = True
    # Email thông báo lịch thi (SMTP: Gmail, Amazon SES SMTP, Mailpit khi dev...)
    email_enabled: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    mail_from: str = "UniExam <no-reply@localhost>"
    app_public_url: str = "http://localhost:5173"
    email_poll_seconds: float = Field(default=10, gt=0)
    # Khoảng nghỉ giữa hai email; Amazon SES sandbox chỉ cho 1 email/giây nên đặt 1.1
    email_send_interval_seconds: float = Field(default=0, ge=0, le=60)
    # Sinh viên mất mạng vẫn làm hết bài; máy tự gửi bài khi có mạng lại. Nhận bài gửi muộn tối đa
    # bấy nhiêu phút sau giờ hết hạn (0 = tắt). Trong khoảng này giáo viên chưa công bố được kết quả
    # nếu có bài bị tự nộp do hết giờ, để không bỏ sót bài của thí sinh đang mất mạng.
    offline_submit_grace_minutes: int = Field(default=30, ge=0, le=1440)
    # Gateway EC2: khi private-api không trả lời, giữ tạm bài nộp ngoại tuyến trên S3 (mã hóa AES-256-GCM
    # bằng khóa chỉ nằm trong .env của EC2), rồi tự chuyển về private-api và xóa khỏi S3. Bỏ trống bucket = tắt.
    offline_buffer_bucket: str = ""
    offline_buffer_prefix: str = "offline-buffer/"
    offline_buffer_rejected_prefix: str = "offline-buffer-rejected/"
    offline_buffer_key: str = ""  # base64 của 32 byte ngẫu nhiên: openssl rand -base64 32
    offline_relay_seconds: float = Field(default=30, gt=0)
    offline_forward_timeout_seconds: float = Field(default=30, gt=0)
    aws_region: str = "ap-southeast-2"

    @model_validator(mode="after")
    def offline_buffer_key_valid(self):
        if self.offline_buffer_bucket:
            import base64
            import binascii
            try:
                key = base64.b64decode(self.offline_buffer_key, validate=True)
            except (binascii.Error, ValueError):
                key = b""
            if len(key) != 32:
                raise ValueError("OFFLINE_BUFFER_KEY phải là base64 của đúng 32 byte (openssl rand -base64 32)")
        return self

    @model_validator(mode="after")
    def secure_production(self):
        if self.environment == "production" and (
            len(self.jwt_secret) < 32 or self.jwt_secret.startswith("dev-")
            or len(self.internal_api_key) < 16 or self.internal_api_key.startswith("dev-")
        ):
            raise ValueError("Production requires private JWT_SECRET and INTERNAL_API_KEY")
        return self


settings = Settings()
