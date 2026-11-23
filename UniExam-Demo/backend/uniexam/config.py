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

    @model_validator(mode="after")
    def secure_production(self):
        if self.environment == "production" and (
            len(self.jwt_secret) < 32 or self.jwt_secret.startswith("dev-")
            or len(self.internal_api_key) < 16 or self.internal_api_key.startswith("dev-")
        ):
            raise ValueError("Production requires private JWT_SECRET and INTERNAL_API_KEY")
        return self


settings = Settings()
