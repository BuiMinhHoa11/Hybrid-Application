"""Exam authoring, audience assignment, scheduled visibility and student listing."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, now_utc
from uniexam.db import get_db, one, many, run
from uniexam.errors import AppError
from uniexam.notifications import queue_schedule_emails
from uniexam.security import teacher_user, student_user, require_owned
from uniexam.routers.questions import scoped_owner

router = APIRouter(tags=["Exams"])


class ExamInput(Schema):
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    paper_id: UUID | None = None
    publish_at: AwareDatetime | None = None
    start_time: AwareDatetime
    end_time: AwareDatetime
    duration_minutes: int = Field(ge=1, le=600)
    question_count: int = Field(ge=1, le=500)

    @field_validator("title", "subject")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Không được để trống")
        return value.strip()

    @model_validator(mode="after")
    def valid_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        if self.publish_at is not None and self.publish_at > self.start_time:
            raise ValueError("Giờ công bố phải trước hoặc bằng giờ bắt đầu")
        return self


class ExamPatch(Schema):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    paper_id: UUID | None = None
    publish_at: AwareDatetime | None = None
    start_time: AwareDatetime | None = None
    end_time: AwareDatetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    question_count: int | None = Field(default=None, ge=1, le=500)

    @model_validator(mode="after")
    def no_invalid_null(self):
        for field in self.model_fields_set - {"paper_id", "publish_at"}:
            value = getattr(self, field)
            if value is None or (field in {"title", "subject"} and not value.strip()):
                raise ValueError(f"Trường {field} không được để trống")
        return self


class AudienceInput(Schema):
    student_ids: list[UUID] = Field(default_factory=list, max_length=5000)
    usernames: list[str] = Field(default_factory=list, max_length=5000)

    @field_validator("usernames")
    @classmethod
    def names_not_blank(cls, names):
        if any(not name.strip() or len(name.strip()) > 100 for name in names):
            raise ValueError("Mã sinh viên không hợp lệ")
        return [name.strip() for name in names]


def load_exam(db, exam_id, user, lock=False):
    exam = one(db, "SELECT * FROM exams WHERE id=:id" + (" FOR UPDATE" if lock else ""), id=exam_id)
    if not exam:
        raise AppError(404, "Không tìm thấy kỳ thi", "NOT_FOUND")
    require_owned(exam, user)
    return exam


def assert_draft(exam):
    if exam["status"] != "draft":
        raise AppError(409, "Kỳ thi đã phát hành nên không thể chỉnh sửa", "EXAM_NOT_DRAFT")


def assert_paper(db, paper_id, user):
    if paper_id is None:
        return
    row = one(db, "SELECT * FROM exam_papers WHERE id=:id FOR SHARE", id=paper_id)
    if not row:
        raise AppError(422, "Đề thi không tồn tại", "UNPROCESSABLE")
    require_owned(row, user)


def exam_dto(row):
    return dto({**row, "format": "Trắc nghiệm và điền khuyết trực tuyến"})


def audience_of(db, exam_id):
    return dto(many(db, """SELECT u.id,u.username,u.full_name FROM exam_audience a JOIN users u ON u.id=a.student_id
      WHERE a.exam_id=:id ORDER BY u.username""", id=exam_id))


def validation_issues(db, exam):
    issues = []
    add = lambda field, message: issues.append({"field": field, "message": message})
    if not exam["paper_id"]:
        add("paperId", "Chưa chọn đề thi")
    else:
        stats = one(db, """SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT question_payload_valid(type,options,correct_option_ids,accepted_answers) OR points<=0)::int AS incomplete
          FROM exam_paper_questions WHERE paper_id=:id""", id=exam["paper_id"])
        if stats["n"] == 0:
            add("paperId", "Đề thi chưa có câu hỏi")
        elif stats["n"] != exam["question_count"]:
            add("questionCount", "Số câu cấu hình khác số câu trong đề")
        if stats["incomplete"]:
            add("paperId", "Đề có câu thiếu đáp án đúng hoặc điểm")
    now = now_utc()
    if exam["start_time"] <= now:
        add("startTime", "Giờ bắt đầu phải nằm trong tương lai")
    if exam["publish_at"]:
        if exam["publish_at"] <= now:
            add("publishAt", "Giờ công bố đã qua, hãy chọn giờ mới hoặc công bố ngay")
        if exam["publish_at"] > exam["start_time"]:
            add("publishAt", "Giờ công bố phải trước hoặc bằng giờ bắt đầu")
    if (exam["end_time"] - exam["start_time"]).total_seconds() < exam["duration_minutes"] * 60:
        add("durationMinutes", "Khung giờ thi ngắn hơn thời lượng làm bài")
    if not one(db, "SELECT student_id FROM exam_audience WHERE exam_id=:id LIMIT 1", id=exam["id"]):
        add("audience", "Chưa có sinh viên nào được chỉ định dự thi")
    return issues


@router.get("/teacher/exams")
def list_exams(q: str = "", status: str = "", page: int = Query(1, ge=1),
               page_size: int = Query(15, alias="pageSize", ge=1, le=100), db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    if status and status not in {"draft", "published", "open", "locked", "closed"}:
        raise AppError(400, "Trạng thái không hợp lệ", "VALIDATION_ERROR")
    where = "(CAST(:owner AS uuid) IS NULL OR e.owner_id=CAST(:owner AS uuid))"
    params = {"owner": scoped_owner(user)}
    if status:
        where += " AND e.status=:status"
        params["status"] = status
    if q.strip():
        where += " AND (strpos(lower(e.title), lower(:search))>0 OR strpos(lower(e.subject), lower(:search))>0)"
        params["search"] = q.strip()
    total = one(db, f"SELECT count(*)::int AS n FROM exams e WHERE {where}", **params)["n"]
    rows = many(db, f"""SELECT e.*, (SELECT count(*)::int FROM exam_audience a WHERE a.exam_id=e.id) AS audience_count,
      (SELECT title FROM exam_papers p WHERE p.id=e.paper_id) AS paper_title FROM exams e WHERE {where}
      ORDER BY e.start_time DESC,e.id LIMIT :limit OFFSET :offset""", **params, limit=page_size, offset=(page - 1) * page_size)
    return {"items": [exam_dto(row) for row in rows], "total": total, "page": page, "pageSize": page_size}


@router.post("/teacher/exams", status_code=201)
def create_exam(body: ExamInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    assert_paper(db, body.paper_id, user)
    row = one(db, """INSERT INTO exams(owner_id,paper_id,title,subject,description,publish_at,start_time,end_time,duration_minutes,question_count)
      VALUES (:owner,:paper_id,:title,:subject,:description,:publish_at,:start_time,:end_time,:duration_minutes,:question_count) RETURNING *""",
      owner=user["id"], **body.model_dump())
    return exam_dto(row)


@router.get("/teacher/exams/{exam_id}")
def get_exam(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    return {"exam": exam_dto(load_exam(db, exam_id, user)), "audience": audience_of(db, exam_id)}


@router.put("/teacher/exams/{exam_id}")
def update_exam(exam_id: UUID, body: ExamPatch, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    exam = load_exam(db, exam_id, user, lock=True)
    assert_draft(exam)
    patch = body.model_dump(exclude_unset=True)
    if "paper_id" in patch:
        assert_paper(db, patch["paper_id"], user)
    for field in ("title", "subject", "description"):
        if field in patch:
            patch[field] = patch[field].strip()
    merged = {**exam, **patch}
    if merged["end_time"] <= merged["start_time"]:
        raise AppError(422, "Giờ kết thúc phải sau giờ bắt đầu", "UNPROCESSABLE")
    if merged["publish_at"] and merged["publish_at"] > merged["start_time"]:
        raise AppError(422, "Giờ công bố phải trước hoặc bằng giờ bắt đầu", "UNPROCESSABLE")
    if patch:
        # Keys come exclusively from the typed model, never from an SQL identifier supplied by a client.
        sets = ",".join(f"{key}=:{key}" for key in patch)
        exam = one(db, f"UPDATE exams SET {sets} WHERE id=:id RETURNING *", id=exam_id, **patch)
    return exam_dto(exam)


@router.delete("/teacher/exams/{exam_id}")
def delete_exam(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    exam = load_exam(db, exam_id, user, lock=True)
    assert_draft(exam)
    run(db, "DELETE FROM exams WHERE id=:id", id=exam_id)
    return {"deleted": True}


@router.put("/teacher/exams/{exam_id}/audience")
def replace_audience(exam_id: UUID, body: AudienceInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    exam = load_exam(db, exam_id, user, lock=True)
    assert_draft(exam)
    rows = many(db, """SELECT id,username FROM users WHERE role='student' AND is_active
      AND (id=ANY(CAST(:ids AS uuid[])) OR lower(username)=ANY(CAST(:names AS text[])))""",
      ids=body.student_ids, names=[name.lower() for name in body.usernames])
    found_ids, found_names = {row["id"] for row in rows}, {row["username"].lower() for row in rows}
    unknown = [str(id) for id in body.student_ids if id not in found_ids] + [name for name in body.usernames if name.lower() not in found_names]
    if unknown:
        raise AppError(422, "Có sinh viên không tồn tại hoặc không hoạt động", "UNPROCESSABLE", {"unknown": unknown})
    run(db, "DELETE FROM exam_audience WHERE exam_id=:id", id=exam_id)
    if found_ids:
        run(db, """INSERT INTO exam_audience(exam_id,student_id)
          SELECT :exam,student FROM unnest(CAST(:students AS uuid[])) AS student""", exam=exam_id, students=sorted(found_ids))
    return {"audience": audience_of(db, exam_id)}


@router.post("/teacher/exams/{exam_id}/validate")
def validate_exam(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    exam = load_exam(db, exam_id, user, lock=True)
    assert_draft(exam)
    issues = validation_issues(db, exam)
    return {"valid": not issues, "issues": issues}


@router.post("/teacher/exams/{exam_id}/publish")
def publish_exam(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    exam = load_exam(db, exam_id, user, lock=True)
    assert_draft(exam)
    assert_paper(db, exam["paper_id"], user)
    issues = validation_issues(db, exam)
    if issues:
        raise AppError(422, "Kỳ thi chưa đủ điều kiện phát hành", "UNPROCESSABLE", issues)
    published = one(db, "UPDATE exams SET status='published' WHERE id=:id RETURNING *", id=exam_id)
    return {**exam_dto(published), "emailNotifications": queue_schedule_emails(db, published)}


def student_exam_dto(row, with_description=False):
    now = now_utc()
    available = "ended" if row["status"] in {"locked", "closed"} or now >= row["end_time"] else "upcoming" if now < row["start_time"] else "open"
    allowed = available == "open" and row["status"] in {"published", "open"} and row["session_status"] != "submitted"
    result = {key: row[key] for key in ("id", "title", "subject", "start_time", "end_time", "duration_minutes", "question_count", "status", "session_id", "session_status")}
    result.update(format="Trắc nghiệm và điền khuyết trực tuyến", availability=available, can_start=allowed)
    if with_description:
        result["description"] = row["description"]
    return dto(result)


STUDENT_SELECT = """SELECT e.*,ss.id AS session_id,ss.status AS session_status FROM exams e
  JOIN exam_audience a ON a.exam_id=e.id AND a.student_id=:student
  LEFT JOIN exam_sessions ss ON ss.exam_id=e.id AND ss.student_id=:student
  WHERE e.status<>'draft' AND (e.publish_at IS NULL OR e.publish_at<=now())"""


@router.get("/student/exams")
def student_exams(db: Session = Depends(get_db, scope="function"), user=Depends(student_user, scope="function")):
    rows = many(db, STUDENT_SELECT + " ORDER BY e.start_time DESC,e.id", student=user["id"])
    return {"serverTime": now_utc(), "items": [student_exam_dto(row) for row in rows]}


@router.get("/student/exams/{exam_id}")
def student_exam(exam_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(student_user, scope="function")):
    row = one(db, STUDENT_SELECT + " AND e.id=:id", student=user["id"], id=exam_id)
    if not row:
        raise AppError(404, "Không tìm thấy kỳ thi hoặc bạn không thuộc đối tượng dự thi", "NOT_FOUND")
    return {"serverTime": now_utc(), "exam": student_exam_dto(row, True)}
