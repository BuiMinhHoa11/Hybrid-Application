"""Dữ liệu bài nộp ngoại tuyến; dùng chung cho private-api và gateway (gateway không import database)."""
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from uniexam.common import Schema


class OfflineAnswer(Schema):
    question_id: UUID
    # Như khi tự lưu: trắc nghiệm là mã lựa chọn, điền chỗ trống là [câu trả lời] hoặc [].
    selected_option_ids: list[str] = Field(default_factory=list, max_length=8)
    flagged: bool = False

    @model_validator(mode="after")
    def valid_values(self):
        if any(not value or len(value) > 500 for value in self.selected_option_ids):
            raise ValueError("Câu trả lời không hợp lệ")
        return self


class OfflineSubmit(Schema):
    """Toàn bộ bài làm giữ trên máy sinh viên, gửi lên một lần khi có mạng lại."""
    answers: list[OfflineAnswer] = Field(max_length=500)
    # Giờ trên máy sinh viên: chỉ để giáo viên tham khảo, server không dùng làm mốc chấm.
    sealed_at: AwareDatetime
    offline_seconds: int = Field(default=0, ge=0, le=7 * 24 * 3600)
