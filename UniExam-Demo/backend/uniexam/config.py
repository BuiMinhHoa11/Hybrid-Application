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

    @model_validator(mode="after")
    def secure_production(self):
        if self.environment == "production" and (
            len(self.jwt_secret) < 32 or self.jwt_secret.startswith("dev-")
            or len(self.internal_api_key) < 16 or self.internal_api_key.startswith("dev-")
        ):
            raise ValueError("Production requires private JWT_SECRET and INTERNAL_API_KEY")
        return self


settings = Settings()
