"""Internal leased grading queue. A signed claim prevents stale workers overwriting results."""
import hashlib
import hmac
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import Field, model_validator
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, dump_json, now_utc
from uniexam.config import settings
from uniexam.db import get_db, many, one, run
from uniexam.errors import AppError
from uniexam.security import internal_access

router = APIRouter(prefix="/grading", tags=["Internal grading"], dependencies=[Depends(internal_access, scope="function")])
DB = Annotated[Session, Depends(get_db, scope="function")]
MAX_ATTEMPTS = 5
LEASE_SECONDS = 300


class ClaimBody(Schema):
    worker_id: str = Field(min_length=1, max_length=100)
    submission_id: UUID | None = None


class ClaimReference(ClaimBody):
    attempt: int = Field(ge=1, le=MAX_ATTEMPTS)
    claim_token: str = Field(pattern=r"^[0-9a-f]{64}$")


class GradeDetail(Schema):
    question_id: UUID
    selected_option_ids: list[str] = Field(default_factory=list, max_length=8)
    text_answer: str | None = Field(default=None, max_length=500)
    correct_option_ids: list[str] = Field(default_factory=list, max_length=8)
    accepted_answers: list[str] = Field(default_factory=list, max_length=8)
    correct: bool
    earned: Decimal = Field(ge=0, max_digits=8, decimal_places=2)
    max: Decimal = Field(gt=0, max_digits=8, decimal_places=2)


class ResultBody(ClaimReference):
    score: Decimal = Field(ge=0, max_digits=8, decimal_places=2)
    max_score: Decimal = Field(gt=0, max_digits=8, decimal_places=2)
    details: list[GradeDetail] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def score_in_range(self):
        if self.score > self.max_score:
            raise ValueError("Điểm không được lớn hơn điểm tối đa")
        return self


class FailureBody(ClaimReference):
    reason: str = Field(default="Lỗi chấm bài", min_length=1, max_length=500)


def claim_signature(submission: UUID, worker: str, attempt: int) -> str:
    content = f"{submission}:{worker}:{attempt}".encode()
    return hmac.new(settings.internal_api_key.encode(), content, hashlib.sha256).hexdigest()


def require_current_claim(db: Session, submission_id: UUID, body: ClaimReference) -> dict:
    expected = claim_signature(submission_id, body.worker_id, body.attempt)
    if not hmac.compare_digest(body.claim_token, expected):
        raise AppError(403, "Thông tin nhận chấm không hợp lệ", "INVALID_CLAIM")
    row = one(db, "SELECT * FROM submissions WHERE id = :id FOR UPDATE", id=submission_id)
    if not row:
        raise AppError(404, "Không tìm thấy bài nộp", "NOT_FOUND")
    if (row["status"] != "grading" or row["attempts"] != body.attempt or not row["claimed_at"] or (now_utc() - row["claimed_at"]).total_seconds() > LEASE_SECONDS):
        raise AppError(409, "Lượt chấm đã hết hạn hoặc bài đã được giao lại", "STALE_CLAIM")
    return row


@router.post("/claim")
def claim(body: ClaimBody, db: DB):
    run(db, """UPDATE submissions SET status = 'failed', fail_reason = 'Quá số lần chấm cho phép'
WHERE status = 'grading' AND attempts >= :max_attempts
AND claimed_at < clock_timestamp() - interval '5 minutes'""", max_attempts=MAX_ATTEMPTS)
    row = one(db, """UPDATE submissions SET status = 'grading', claimed_at = clock_timestamp(), attempts = attempts + 1
WHERE id = (
SELECT id FROM submissions
WHERE attempts < :max_attempts
AND (status = 'pending_grading' OR (status = 'grading' AND claimed_at < clock_timestamp() - interval '5 minutes'))
AND (CAST(:submission_id AS uuid) IS NULL OR id = CAST(:submission_id AS uuid))
ORDER BY submitted_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
) RETURNING *""", max_attempts=MAX_ATTEMPTS, submission_id=body.submission_id)
    if not row:
        return Response(status_code=204)
    questions = many(db, """SELECT q.id, q.type, q.points, q.correct_option_ids, q.accepted_answers
FROM exam_paper_questions q JOIN exam_sessions ss ON ss.paper_id = q.paper_id
WHERE ss.id = :session ORDER BY q.position""", session=row["session_id"])
    return dto({"submission_id": row["id"], "exam_id": row["exam_id"], "student_id": row["student_id"], "attempt": row["attempts"], "claim_token": claim_signature(row["id"], body.worker_id, row["attempts"]), "answers": row["answers_snapshot"], "questions": questions})


@router.post("/{submission_id}/result")
def save_result(submission_id: UUID, body: ResultBody, db: DB):
    submission = require_current_claim(db, submission_id, body)
    questions = many(db, "SELECT q.id, q.points FROM exam_paper_questions q JOIN exam_sessions ss ON ss.paper_id = q.paper_id WHERE ss.id = :session", session=submission["session_id"])
    points = {row["id"]: row["points"] for row in questions}
    identifiers = [item.question_id for item in body.details]
    if len(set(identifiers)) != len(identifiers) or set(identifiers) != set(points):
        raise AppError(422, "Chi tiết chấm phải chứa đúng các câu hỏi của đề", "INVALID_GRADING_RESULT")
    for detail in body.details:
        maximum = points[detail.question_id]
        if detail.max != maximum or detail.earned != (maximum if detail.correct else Decimal("0")):
            raise AppError(422, "Điểm từng câu không khớp barem", "INVALID_GRADING_RESULT")
    if body.max_score != sum(points.values(), Decimal("0")) or body.score != sum((item.earned for item in body.details), Decimal("0")):
        raise AppError(422, "Tổng điểm không khớp chi tiết chấm", "INVALID_GRADING_RESULT")
    run(db, """INSERT INTO grading_results(submission_id, score, max_score, details, graded_by, created_at)
VALUES (:id, :score, :maximum, CAST(:details AS jsonb), :worker, clock_timestamp())
ON CONFLICT (submission_id) DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, details = EXCLUDED.details, graded_by = EXCLUDED.graded_by, created_at = clock_timestamp()""", id=submission_id, score=body.score, maximum=body.max_score, details=dump_json([dto(detail.model_dump()) for detail in body.details]), worker=body.worker_id)
    run(db, "UPDATE submissions SET status = 'graded', graded_at = clock_timestamp(), fail_reason = NULL WHERE id = :id", id=submission_id)
    return {"status": "graded"}


@router.post("/{submission_id}/fail")
def report_failure(submission_id: UUID, body: FailureBody, db: DB):
    submission = require_current_claim(db, submission_id, body)
    state = "failed" if submission["attempts"] >= MAX_ATTEMPTS else "pending_grading"
    run(db, "UPDATE submissions SET status = :status, fail_reason = :reason WHERE id = :id", status=state, reason=body.reason.strip(), id=submission_id)
    return {"status": "failed" if state == "failed" else "requeued"}
