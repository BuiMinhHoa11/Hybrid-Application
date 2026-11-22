"""Student attempts, safe paper delivery, autosave and immutable submissions."""
from datetime import timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, dump_json, now_utc
from uniexam.db import get_db, many, one, run
from uniexam.grading_queue import enqueue
from uniexam.errors import AppError
from uniexam.security import student_user

router = APIRouter(tags=["Exam sessions"])
DB = Annotated[Session, Depends(get_db, scope="function")]
Student = Annotated[dict, Depends(student_user, scope="function")]


class StartSession(Schema):
    exam_id: UUID


class FullscreenEvent(Schema):
    id: UUID
    type: Literal["fullscreen_enter", "fullscreen_exit"]
    client_time: AwareDatetime


class AnswerPatch(Schema):
    selected_option_ids: list[str] | None = Field(default=None, max_length=8)
    text_answer: str | None = Field(default=None, max_length=500)
    flagged: bool | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("Cần gửi câu trả lời hoặc cờ xem lại")
        if "selected_option_ids" in self.model_fields_set:
            if self.selected_option_ids is None or any(not value or len(value) > 500 for value in self.selected_option_ids):
                raise ValueError("Câu trả lời không hợp lệ")
        if "flagged" in self.model_fields_set and self.flagged is None:
            raise ValueError("Cờ xem lại phải là true hoặc false")
        if "selected_option_ids" in self.model_fields_set and "text_answer" in self.model_fields_set:
            raise ValueError("Chỉ gửi selectedOptionIds hoặc textAnswer")
        return self


def session_dto(row: dict):
    return dto({key: row[key] for key in (
        "id", "exam_id", "status", "started_at", "expires_at", "submitted_at", "submit_reason"
    )})


def finalize_session(db: Session, session_id: UUID, reason: str = "student") -> dict | None:
    """Caller owns the transaction. Row lock serializes finalization against autosave."""
    session = one(db, "SELECT * FROM exam_sessions WHERE id = :id FOR UPDATE", id=session_id)
    if not session:
        return None
    total = one(db, "SELECT count(*) AS n FROM exam_paper_questions WHERE paper_id = :id", id=session["paper_id"])["n"]
    if session["status"] == "submitted":
        sub = one(db, "SELECT * FROM submissions WHERE session_id = :id", id=session_id)
        if not sub:
            raise AppError(409, "Phiên đã nộp nhưng thiếu bản ghi bài nộp", "BAD_STATE")
        snapshot = sub["answers_snapshot"]
        duplicate = True
    else:
        snapshot = many(db, """SELECT question_id, selected_option_ids, text_answer
            FROM answers WHERE session_id = :id ORDER BY question_id""", id=session_id)
        finished = one(db, """UPDATE exam_sessions SET status = 'submitted', submitted_at = clock_timestamp(), submit_reason = :reason
            WHERE id = :id RETURNING submitted_at""", id=session_id, reason=reason)
        sub = one(db, """INSERT INTO submissions(session_id, exam_id, student_id, answers_snapshot, submitted_at)
            VALUES (:session, :exam, :student, CAST(:answers AS jsonb), :submitted_at) RETURNING *""",
            session=session_id, exam=session["exam_id"], student=session["student_id"], answers=dump_json(snapshot),
            submitted_at=finished["submitted_at"])
        duplicate = False
    # Redis is the transport layer; PostgreSQL remains the durable source of truth.
    enqueue(str(sub["id"]))
    answered = sum(bool(answer.get("selected_option_ids") or str(answer.get("text_answer") or "").strip()) for answer in snapshot)
    return dto({"submission_id": sub["id"], "already_submitted": duplicate,
                "total": total, "answered": answered, "unanswered": max(0, total - answered), "status": sub["status"]})


def owned_session(db: Session, session_id: UUID, user: dict, lock: str = "UPDATE") -> dict:
    # Lock is selected exclusively by server code, never by request input.
    row = one(db, f"SELECT * FROM exam_sessions WHERE id = :id FOR {lock}", id=session_id)
    if not row or row["student_id"] != user["id"]:
        raise AppError(404, "Không tìm thấy phiên làm bài", "NOT_FOUND")
    return row


@router.post("/exam-sessions", status_code=201)
def start_session(body: StartSession, db: DB, user: Student, response: Response):
    # Shares the exam lock with publication: no attempt can slip in after results are revealed.
    exam = one(db, """SELECT e.* FROM exams e JOIN exam_audience a ON a.exam_id = e.id
        WHERE e.id = :exam AND a.student_id = :student FOR SHARE OF e""", exam=body.exam_id, student=user["id"])
    now = now_utc()
    if not exam or exam["status"] == "draft" or (exam["publish_at"] and exam["publish_at"] > now):
        raise AppError(404, "Không tìm thấy kỳ thi hoặc bạn không thuộc đối tượng dự thi", "NOT_FOUND")
    existing = one(db, "SELECT * FROM exam_sessions WHERE exam_id = :exam AND student_id = :student FOR UPDATE",
                   exam=body.exam_id, student=user["id"])
    if existing:
        if existing["status"] == "submitted":
            raise AppError(409, "Bạn đã nộp bài của kỳ thi này", "ALREADY_SUBMITTED")
        if existing["expires_at"] <= now:
            finalize_session(db, existing["id"], "timeout")
            db.commit()
            raise AppError(409, "Đã hết thời gian làm bài, bài của bạn đã được tự động nộp", "TIME_UP")
        if exam["results_published"] or exam["status"] == "closed":
            raise AppError(409, "Kỳ thi đã đóng", "EXAM_CLOSED")
        response.status_code = 200
        return {"session": session_dto(existing), "serverTime": dto(now), "resumed": True}
    if exam["results_published"] or exam["status"] not in {"published", "open"} or now >= exam["end_time"]:
        raise AppError(409, "Kỳ thi đã kết thúc hoặc không còn mở", "EXAM_CLOSED")
    if now < exam["start_time"]:
        raise AppError(409, "Kỳ thi chưa đến giờ bắt đầu", "NOT_STARTED")
    if not exam["paper_id"]:
        raise AppError(409, "Kỳ thi chưa có đề", "NO_PAPER")
    expires = min(now + timedelta(minutes=exam["duration_minutes"]), exam["end_time"])
    created = one(db, """INSERT INTO exam_sessions(exam_id, student_id, paper_id, started_at, expires_at)
        VALUES (:exam, :student, :paper, :started, :expires)
        ON CONFLICT (exam_id, student_id) DO NOTHING RETURNING *""",
        exam=exam["id"], student=user["id"], paper=exam["paper_id"], started=now, expires=expires)
    if not created:
        # A second simultaneous request resumes the single attempt created by the first one.
        created = one(db, "SELECT * FROM exam_sessions WHERE exam_id = :exam AND student_id = :student FOR UPDATE",
                      exam=body.exam_id, student=user["id"])
        if created["status"] != "in_progress":
            raise AppError(409, "Bạn đã nộp bài của kỳ thi này", "ALREADY_SUBMITTED")
        response.status_code = 200
    return {"session": session_dto(created), "serverTime": dto(now), "resumed": created["started_at"] != now}


@router.get("/exam-sessions/{session_id}")
def get_session(session_id: UUID, db: DB, user: Student):
    session = owned_session(db, session_id, user)
    now = now_utc()
    if session["status"] == "in_progress" and session["expires_at"] <= now:
        finalize_session(db, session_id, "timeout")
        session = one(db, "SELECT * FROM exam_sessions WHERE id = :id", id=session_id)
    exam = one(db, "SELECT id, title, subject, duration_minutes FROM exams WHERE id = :id", id=session["exam_id"])
    payload = {"serverTime": dto(now), "session": session_dto(session), "exam": dto(exam), "questions": [], "answers": {}}
    if session["status"] != "in_progress":
        return payload
    # Explicit safe-column projection. Accepted answers and correct option IDs never leave this query.
    questions = many(db, """SELECT id, type, position, content, image_data_url, options, points,
        type = 'multiple_choice' AND cardinality(correct_option_ids) > 1 AS allow_multiple
        FROM exam_paper_questions WHERE paper_id = :id ORDER BY position""", id=session["paper_id"])
    for question in questions:
        question["options"] = [{"id": option["id"], "text": option["text"]} for option in question["options"]]
    payload["questions"] = dto(questions)
    rows = many(db, "SELECT question_id, selected_option_ids, text_answer, flagged FROM answers WHERE session_id = :id", id=session_id)
    payload["answers"] = {str(row["question_id"]): {
        "selectedOptionIds": [row["text_answer"]] if row["text_answer"] is not None else row["selected_option_ids"],
        "textAnswer": row["text_answer"], "flagged": row["flagged"]
    } for row in rows}
    return payload


@router.put("/exam-sessions/{session_id}/answers/{question_id}")
def save_answer(session_id: UUID, question_id: UUID, body: AnswerPatch, db: DB, user: Student):
    session = owned_session(db, session_id, user, "SHARE")
    if session["status"] != "in_progress":
        raise AppError(409, "Bài đã được nộp, không thể sửa đáp án", "SESSION_LOCKED")
    if session["expires_at"] <= now_utc():
        # Release SHARE before acquiring UPDATE: concurrent expired autosaves must not deadlock on upgrade.
        db.commit()
        finalize_session(db, session_id, "timeout")
        db.commit()
        raise AppError(409, "Đã hết thời gian làm bài, bài đã được tự động nộp", "TIME_UP")
    question = one(db, "SELECT id, type, options FROM exam_paper_questions WHERE id = :id AND paper_id = :paper",
                   id=question_id, paper=session["paper_id"])
    if not question:
        raise AppError(404, "Câu hỏi không thuộc đề thi của bạn", "NOT_FOUND")
    has_answer = bool({"text_answer", "selected_option_ids"} & body.model_fields_set)
    selected, text_answer = [], None
    if has_answer:
        if question["type"] == "fill_blank":
            if body.selected_option_ids is not None and len(body.selected_option_ids) > 1:
                raise AppError(422, "Chỉ nhập một câu trả lời cho chỗ trống", "UNPROCESSABLE")
            text_answer = body.text_answer if "text_answer" in body.model_fields_set else next(iter(body.selected_option_ids or []), None)
            if text_answer is not None and not text_answer.strip():
                text_answer = None
        else:
            if body.text_answer is not None:
                raise AppError(422, "Câu trắc nghiệm phải trả lời bằng mã lựa chọn", "UNPROCESSABLE")
            selected = list(dict.fromkeys(body.selected_option_ids or []))
            valid = {option["id"] for option in question["options"]}
            if any(option not in valid for option in selected):
                raise AppError(422, "Lựa chọn không hợp lệ cho câu hỏi này", "UNPROCESSABLE")
    saved = one(db, """INSERT INTO answers(session_id, paper_id, question_id, selected_option_ids, text_answer, flagged)
        SELECT :session, :paper, :question, CAST(:selected AS text[]), :text_answer, COALESCE(:flagged, false)
        FROM exam_sessions ss WHERE ss.id = :session AND ss.expires_at > clock_timestamp()
        ON CONFLICT (session_id, question_id) DO UPDATE SET
          selected_option_ids = CASE WHEN :has_answer THEN EXCLUDED.selected_option_ids ELSE answers.selected_option_ids END,
          text_answer = CASE WHEN :has_answer THEN EXCLUDED.text_answer ELSE answers.text_answer END,
          flagged = COALESCE(:flagged, answers.flagged)
        WHERE clock_timestamp() < :expires
        RETURNING *""", session=session_id, paper=session["paper_id"], question=question_id,
        selected=selected, text_answer=text_answer, flagged=body.flagged, has_answer=has_answer, expires=session["expires_at"])
    if saved is None:
        db.commit()
        finalize_session(db, session_id, "timeout")
        db.commit()
        raise AppError(409, "Đã hết thời gian làm bài, bài đã được tự động nộp", "TIME_UP")
    return dto({"question_id": question_id, "selected_option_ids": [saved["text_answer"]] if saved["text_answer"] is not None else saved["selected_option_ids"],
                "text_answer": saved["text_answer"], "flagged": saved["flagged"], "updated_at": saved["updated_at"]})


@router.post("/exam-sessions/{session_id}/submit")
def submit_session(session_id: UUID, db: DB, user: Student):
    session = owned_session(db, session_id, user)
    reason = "timeout" if session["expires_at"] <= now_utc() else "student"
    return finalize_session(db, session_id, reason)


@router.post("/exam-sessions/{session_id}/events", status_code=201)
def record_fullscreen_event(session_id: UUID, body: FullscreenEvent, db: DB, user: Student, response: Response):
    session = owned_session(db, session_id, user, "SHARE")
    existing = one(db, "SELECT * FROM exam_session_events WHERE id=:id", id=body.id)
    if existing:
        if existing["session_id"] != session_id or existing["type"] != body.type or existing["client_time"] != body.client_time:
            raise AppError(409, "Mã sự kiện đã được sử dụng", "EVENT_CONFLICT")
        response.status_code = 200
        return dto(existing)
    now = now_utc()
    ended = min(session["expires_at"], session["submitted_at"] or session["expires_at"])
    # Client time is an observation, never the authoritative submission clock.
    # Permit delayed delivery after reconnecting without counting intentional exit after submission.
    if (body.client_time < session["started_at"] - timedelta(seconds=5)
            or body.client_time >= ended or body.client_time > now + timedelta(seconds=30)
            or now > ended + timedelta(minutes=10)):
        raise AppError(422, "Sự kiện nằm ngoài thời gian làm bài", "EVENT_OUTSIDE_SESSION")
    saved = one(db, """INSERT INTO exam_session_events(id,session_id,type,client_time)
        VALUES (:id,:session,:type,:time) ON CONFLICT(id) DO NOTHING RETURNING *""",
        id=body.id, session=session_id, type=body.type, time=body.client_time)
    if not saved:
        saved = one(db, "SELECT * FROM exam_session_events WHERE id=:id", id=body.id)
        if saved["session_id"] != session_id or saved["type"] != body.type or saved["client_time"] != body.client_time:
            raise AppError(409, "Mã sự kiện đã được sử dụng", "EVENT_CONFLICT")
        response.status_code = 200
    return dto(saved)
