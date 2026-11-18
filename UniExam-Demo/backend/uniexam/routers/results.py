"""Teacher result management and publication-gated student reviews."""

from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, now_utc
from uniexam.db import get_db, many, one
from uniexam.errors import AppError
from uniexam.security import require_owned, student_user, teacher_user
from uniexam.services.results_policy import publication_policy


router = APIRouter(tags=["results"])


class PublishBody(Schema):
    confirm: Literal[True]


def owned_exam(db: Session, exam_id: UUID, user: dict[str, Any], *, lock: bool = False) -> dict[str, Any]:
    suffix = " FOR UPDATE" if lock else ""
    exam = one(db, "SELECT * FROM exams WHERE id = :exam_id" + suffix, exam_id=exam_id)
    if not exam or exam["status"] == "draft":
        raise AppError(404, "Không tìm thấy kỳ thi", "NOT_FOUND")
    require_owned(exam, user)
    return exam


def publication_state(db: Session, exam_id: UUID) -> dict[str, Any]:
    return one(
        db,
        """SELECT
          (SELECT count(*)::int FROM exam_audience WHERE exam_id = :exam_id) AS audience,
          (SELECT count(*)::int FROM exam_audience a
           JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id AND ss.status = 'submitted'
           JOIN submissions sub ON sub.session_id = ss.id WHERE a.exam_id = :exam_id) AS submitted,
          (SELECT count(*)::int FROM exam_sessions WHERE exam_id = :exam_id AND status = 'in_progress') AS open_sessions,
          (SELECT count(*)::int FROM submissions sub LEFT JOIN grading_results gr ON gr.submission_id = sub.id
           WHERE sub.exam_id = :exam_id AND (sub.status <> 'graded' OR gr.id IS NULL)) AS ungraded""",
        exam_id=exam_id,
    )


def _field(row: dict[str, Any], snake: str, camel: str, default: Any = None) -> Any:
    return row.get(snake, row.get(camel, default))


def build_review(db: Session, exam: dict[str, Any], header: dict[str, Any], reveal: bool) -> dict[str, Any]:
    # Only explicitly selected student-safe fields are copied to the response.
    # Answer keys are added in the reveal branch after authorization/publication.
    answers = {
        str(_field(answer, "question_id", "questionId")): answer
        for answer in (header["answers_snapshot"] or [])
    }
    details = {
        str(_field(detail, "question_id", "questionId")): detail
        for detail in (header["details"] or [])
    }
    questions = many(db, "SELECT * FROM exam_paper_questions WHERE paper_id = :paper_id ORDER BY position", paper_id=exam["paper_id"])
    review_questions: list[dict[str, Any]] = []
    for question in questions:
        answer = answers.get(str(question["id"]), {})
        selected = _field(answer, "selected_option_ids", "selectedOptionIds", []) or []
        text_answer = _field(answer, "text_answer", "textAnswer")
        if question["type"] == "fill_blank":
            # Support both the typed Python snapshot and the former array format.
            text_answer = text_answer if text_answer is not None else (selected[0] if selected else None)
            selected = [text_answer] if text_answer is not None and text_answer.strip() else []
        result = {
            "id": question["id"],
            "type": question["type"],
            "position": question["position"],
            "content": question["content"],
            "options": question["options"],
            "points": question["points"],
            "selected_option_ids": selected,
        }
        if question["type"] == "fill_blank":
            result["text_answer"] = text_answer
        if reveal:
            detail = details.get(str(question["id"]), {})
            # Legacy frontend renders accepted text alternatives through this key.
            result["correct_option_ids"] = (
                question["accepted_answers"] if question["type"] == "fill_blank" else question["correct_option_ids"]
            )
            if question["type"] == "fill_blank":
                result["accepted_answers"] = question["accepted_answers"]
            result["correct"] = detail.get("correct")
            result["earned"] = detail.get("earned")
        review_questions.append(result)

    graded = header["status"] == "graded" and header["score"] is not None and header["max_score"] is not None
    return {
        "submission": {"id": header["id"], "status": header["status"], "submitted_at": header["submitted_at"], "submit_reason": header["submit_reason"]},
        "result": {"score": header["score"], "max_score": header["max_score"]} if reveal and graded else None,
        "questions": review_questions,
    }


HEADER_SELECT = """SELECT sub.id, sub.student_id, sub.status, sub.submitted_at,
    ss.submit_reason, sub.answers_snapshot, gr.score, gr.max_score, gr.details
    FROM submissions sub JOIN exam_sessions ss ON ss.id = sub.session_id
    LEFT JOIN grading_results gr ON gr.submission_id = sub.id"""


@router.get("/teacher/exam-results")
def exam_summaries(db: Session = Depends(get_db, scope="function"), user: dict = Depends(teacher_user, scope="function")):
    params = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    scope = "" if user["role"] == "admin" else " AND e.owner_id = :owner_id"
    rows = many(
        db,
        """SELECT e.id, e.title, e.subject, e.status, e.start_time, e.end_time, e.results_published,
          (SELECT count(*)::int FROM exam_audience a WHERE a.exam_id = e.id) AS audience_count,
          (SELECT count(*)::int FROM submissions sub WHERE sub.exam_id = e.id) AS submitted_count,
          (SELECT count(*)::int FROM submissions sub JOIN grading_results gr ON gr.submission_id = sub.id
           WHERE sub.exam_id = e.id AND sub.status = 'graded') AS graded_count
          FROM exams e WHERE e.status <> 'draft'""" + scope + " ORDER BY e.start_time DESC, e.id",
        **params,
    )
    return dto({"items": rows})


@router.get("/teacher/exam-results/{exam_id}")
def exam_results(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user: dict = Depends(teacher_user, scope="function")):
    exam = owned_exam(db, exam_id, user)
    rows = many(
        db,
        """SELECT u.id AS student_id, u.username, u.full_name,
          ss.status AS session_status, ss.started_at, sub.id AS submission_id,
          sub.status AS submission_status, sub.submitted_at, ss.submit_reason, gr.score, gr.max_score
          FROM exam_audience a JOIN users u ON u.id = a.student_id
          LEFT JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id
          LEFT JOIN submissions sub ON sub.session_id = ss.id
          LEFT JOIN grading_results gr ON gr.submission_id = sub.id
          WHERE a.exam_id = :exam_id ORDER BY u.username""",
        exam_id=exam_id,
    )
    graded = [row for row in rows if row["submission_status"] == "graded" and row["score"] is not None and row["max_score"] is not None]
    average = round(sum((row["score"] for row in graded), Decimal(0)) / len(graded), 2) if graded else None
    return dto({
        "exam": exam,
        "rows": rows,
        "publication": publication_policy(exam, publication_state(db, exam_id), now_utc()),
        "stats": {
            "audience": len(rows), "started": sum(row["session_status"] is not None for row in rows),
            "submitted": sum(row["submission_id"] is not None for row in rows), "graded": len(graded), "average_score": average,
        },
    })


@router.get("/teacher/exam-results/{exam_id}/submissions/{submission_id}")
def submission_review(exam_id: UUID, submission_id: UUID, db: Session = Depends(get_db, scope="function"), user: dict = Depends(teacher_user, scope="function")):
    exam = owned_exam(db, exam_id, user)
    header = one(db, HEADER_SELECT + " WHERE sub.exam_id = :exam_id AND sub.id = :submission_id", exam_id=exam_id, submission_id=submission_id)
    if not header or not exam["paper_id"]:
        raise AppError(404, "Không tìm thấy bài nộp", "NOT_FOUND")
    return dto(build_review(db, exam, header, True))


@router.post("/teacher/exam-results/{exam_id}/publish")
def publish_results(exam_id: UUID, body: PublishBody, db: Session = Depends(get_db, scope="function"), user: dict = Depends(teacher_user, scope="function")):
    # Session creation takes a shared lock on this row.  Exclusive publication
    # locks prevent a start request from creating a new attempt after disclosure.
    exam = owned_exam(db, exam_id, user, lock=True)
    policy = publication_policy(exam, publication_state(db, exam_id), now_utc())
    if not policy["can_publish"]:
        raise AppError(409, policy["blocked_reason"], policy["code"])
    updated = one(
        db,
        """UPDATE exams e SET status = 'closed', results_published = true,
          results_published_at = now(), results_published_by = :user_id
          WHERE e.id = :exam_id AND e.results_published = false
          AND e.status IN ('published', 'open', 'locked', 'closed')
          AND NOT EXISTS (SELECT 1 FROM exam_sessions ss WHERE ss.exam_id = e.id AND ss.status = 'in_progress')
          AND NOT EXISTS (SELECT 1 FROM submissions sub LEFT JOIN grading_results gr ON gr.submission_id = sub.id
                          WHERE sub.exam_id = e.id AND (sub.status <> 'graded' OR gr.id IS NULL))
          AND (e.status = 'closed' OR e.end_time <= now() OR (
            EXISTS (SELECT 1 FROM exam_audience a WHERE a.exam_id = e.id)
            AND NOT EXISTS (SELECT 1 FROM exam_audience a
              LEFT JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id
              LEFT JOIN submissions sub ON sub.session_id = ss.id
              WHERE a.exam_id = e.id AND (ss.status IS DISTINCT FROM 'submitted' OR sub.id IS NULL))
          )) RETURNING results_published_at""",
        user_id=user["id"], exam_id=exam_id,
    )
    if not updated:
        raise AppError(409, "Trạng thái bài thi vừa thay đổi, hãy tải lại trang", "STATE_CHANGED")
    return dto({"published": True, "published_at": updated["results_published_at"]})


STUDENT_RESULT_SELECT = """SELECT e.id AS exam_id, e.title, e.subject, e.results_published,
    ss.started_at, ss.status AS session_status, ss.submitted_at,
    sub.status AS submission_status, gr.score, gr.max_score
    FROM exam_sessions ss JOIN exams e ON e.id = ss.exam_id
    LEFT JOIN submissions sub ON sub.session_id = ss.id
    LEFT JOIN grading_results gr ON gr.submission_id = sub.id
    WHERE ss.student_id = :student_id"""


def student_result_item(row: dict[str, Any]) -> dict[str, Any]:
    if row["session_status"] == "in_progress":
        status = "in_progress"
    elif row["submission_status"] == "graded" and row["score"] is not None and row["max_score"] is not None:
        status = "published" if row["results_published"] else "graded"
    else:
        status = "pending_grading"
    return {
        "exam_id": row["exam_id"], "title": row["title"], "subject": row["subject"],
        "started_at": row["started_at"], "submitted_at": row["submitted_at"], "status": status,
        "score": row["score"] if status == "published" else None,
        "max_score": row["max_score"] if status == "published" else None,
    }


@router.get("/student/results")
def student_results(db: Session = Depends(get_db, scope="function"), user: dict = Depends(student_user, scope="function")):
    rows = many(db, STUDENT_RESULT_SELECT + " ORDER BY ss.started_at DESC, e.id", student_id=user["id"])
    return dto({"items": [student_result_item(row) for row in rows]})


@router.get("/student/results/{exam_id}")
def student_result_detail(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user: dict = Depends(student_user, scope="function")):
    row = one(db, STUDENT_RESULT_SELECT + " AND e.id = :exam_id", student_id=user["id"], exam_id=exam_id)
    if not row:
        raise AppError(404, "Bạn chưa làm bài của kỳ thi này", "NOT_FOUND")
    item = student_result_item(row)
    if item["status"] != "published":
        return dto({"item": item, "review": None})
    exam = one(db, "SELECT * FROM exams WHERE id = :exam_id", exam_id=exam_id)
    header = one(db, HEADER_SELECT + " WHERE sub.exam_id = :exam_id AND sub.student_id = :student_id", exam_id=exam_id, student_id=user["id"])
    if not exam or not exam["paper_id"] or not header:
        return dto({"item": item, "review": None})
    return dto({"item": item, "review": build_review(db, exam, header, True)})
