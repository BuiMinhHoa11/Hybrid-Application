"""Teacher question bank. Answer keys never leave teacher-only endpoints."""
from decimal import Decimal
from typing import Literal
from uuid import UUID
import re
import unicodedata

from fastapi import APIRouter, Depends, Query
from pydantic import Field, field_validator, model_validator
from sqlalchemy.orm import Session

from uniexam.common import Schema, dump_json, question_dto
from uniexam.db import get_db, many, one, run
from uniexam.errors import AppError
from uniexam.security import require_owned, teacher_user

router = APIRouter(tags=["Question bank"])


def normalize_answer(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split()).lower()


class Option(Schema):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,10}$")
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Nội dung lựa chọn không được để trống")
        return value.strip()


class QuestionInput(Schema):
    subject: str = Field(min_length=1, max_length=200)
    chapter: str = Field(default="", max_length=200)
    topic: str = Field(default="", max_length=200)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    type: Literal["multiple_choice", "fill_blank"] = "multiple_choice"
    content: str = Field(min_length=1, max_length=5000)
    options: list[Option] = Field(default_factory=list, max_length=8)
    correct_option_ids: list[str] = Field(default_factory=list, max_length=8)
    accepted_answers: list[str] | None = Field(default=None, max_length=8)
    points: Decimal = Field(gt=0, le=100, max_digits=6, decimal_places=2, allow_inf_nan=False)

    @field_validator("subject", "content")
    @classmethod
    def required_text(cls, value):
        if not value.strip():
            raise ValueError("Không được để trống")
        return value.strip()

    @field_validator("chapter", "topic")
    @classmethod
    def trim_optional(cls, value):
        return value.strip()

    @model_validator(mode="after")
    def validate_answers(self):
        if self.type == "fill_blank":
            if self.options:
                raise ValueError("Câu điền khuyết không có lựa chọn")
            # Compatibility: the React client previously used correctOptionIds for text answers.
            accepted = self.accepted_answers if self.accepted_answers is not None else self.correct_option_ids
            accepted = [unicodedata.normalize("NFC", item.strip()) for item in accepted]
            if not 1 <= len(accepted) <= 8 or any(not x or len(x) > 500 for x in accepted):
                raise ValueError("Nhập 1–8 đáp án văn bản, mỗi đáp án từ 1–500 ký tự")
            if len(set(map(normalize_answer, accepted))) != len(accepted):
                raise ValueError("Đáp án được chấp nhận bị lặp")
            self.accepted_answers, self.correct_option_ids = accepted, []
        else:
            ids = [item.id for item in self.options]
            if not 2 <= len(ids) <= 8:
                raise ValueError("Cần từ 2 đến 8 lựa chọn")
            if len(set(ids)) != len(ids):
                raise ValueError("Mã lựa chọn bị trùng")
            if not self.correct_option_ids or len(set(self.correct_option_ids)) != len(self.correct_option_ids):
                raise ValueError("Chọn đáp án đúng và không chọn trùng")
            if not set(self.correct_option_ids) <= set(ids):
                raise ValueError("Đáp án đúng không nằm trong lựa chọn")
            if self.accepted_answers:
                raise ValueError("Trắc nghiệm không dùng đáp án văn bản")
            self.accepted_answers = []
        return self


def scoped_owner(user):
    return None if user["role"] == "admin" else user["id"]


def load_question(db, question_id, user, lock=False):
    row = one(db, "SELECT * FROM questions WHERE id = :id" + (" FOR UPDATE" if lock else ""), id=question_id)
    if not row:
        raise AppError(404, "Không tìm thấy câu hỏi", "NOT_FOUND")
    require_owned(row, user)
    return row


@router.get("/teacher/questions/filters")
def filters(db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    row = one(db, """SELECT
      COALESCE(array_agg(DISTINCT subject ORDER BY subject), '{}') AS subjects,
      COALESCE(array_agg(DISTINCT chapter ORDER BY chapter) FILTER (WHERE chapter <> ''), '{}') AS chapters,
      COALESCE(array_agg(DISTINCT topic ORDER BY topic) FILTER (WHERE topic <> ''), '{}') AS topics
      FROM questions WHERE (CAST(:owner AS uuid) IS NULL OR owner_id = CAST(:owner AS uuid))""", owner=scoped_owner(user))
    return row


@router.get("/teacher/questions")
def list_questions(q: str = "", subject: str = "", chapter: str = "", topic: str = "",
                   difficulty: str = "", type: str = "", page: int = Query(1, ge=1),
                   page_size: int = Query(20, alias="pageSize", ge=1, le=100),
                   db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    if difficulty and difficulty not in {"easy", "medium", "hard"}:
        raise AppError(400, "Độ khó không hợp lệ", "VALIDATION_ERROR")
    if type and type not in {"multiple_choice", "fill_blank"}:
        raise AppError(400, "Loại câu hỏi không hợp lệ", "VALIDATION_ERROR")
    clauses = ["(CAST(:owner AS uuid) IS NULL OR owner_id = CAST(:owner AS uuid))"]
    params = {"owner": scoped_owner(user)}
    for key, value in {"subject": subject, "chapter": chapter, "topic": topic, "difficulty": difficulty, "type": type}.items():
        if value:
            clauses.append(f"{key} = :{key}")
            params[key] = value
    if q.strip():
        clauses.append("content ILIKE :search ESCAPE '\\'")
        params["search"] = "%" + re.sub(r"([\\%_])", r"\\\1", q.strip()) + "%"
    where = " AND ".join(clauses)
    total = one(db, f"SELECT count(*)::int AS n FROM questions WHERE {where}", **params)["n"]
    rows = many(db, f"SELECT * FROM questions WHERE {where} ORDER BY created_at DESC, id LIMIT :limit OFFSET :offset",
                **params, limit=page_size, offset=(page - 1) * page_size)
    return {"items": [question_dto(row) for row in rows], "total": total, "page": page, "pageSize": page_size}


@router.get("/teacher/questions/{question_id}")
def get_question(question_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    return question_dto(load_question(db, question_id, user))


def question_params(body: QuestionInput):
    values = body.model_dump()
    values["options"] = dump_json(values["options"])
    return values


@router.post("/teacher/questions", status_code=201)
def create_question(body: QuestionInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    row = one(db, """INSERT INTO questions(owner_id, subject, chapter, topic, difficulty, type, content,
      options, correct_option_ids, accepted_answers, points)
      VALUES (:owner, :subject, :chapter, :topic, :difficulty, :type, :content,
      CAST(:options AS jsonb), CAST(:correct_option_ids AS text[]), CAST(:accepted_answers AS text[]), :points) RETURNING *""",
      owner=user["id"], **question_params(body))
    return question_dto(row)


@router.put("/teacher/questions/{question_id}")
def update_question(question_id: UUID, body: QuestionInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    load_question(db, question_id, user, lock=True)
    row = one(db, """UPDATE questions SET subject=:subject, chapter=:chapter, topic=:topic, difficulty=:difficulty,
      type=:type, content=:content, options=CAST(:options AS jsonb), correct_option_ids=CAST(:correct_option_ids AS text[]),
      accepted_answers=CAST(:accepted_answers AS text[]), points=:points WHERE id=:id RETURNING *""", id=question_id, **question_params(body))
    return question_dto(row)


@router.delete("/teacher/questions/{question_id}")
def delete_question(question_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    load_question(db, question_id, user, lock=True)
    run(db, "DELETE FROM questions WHERE id=:id", id=question_id)
    return {"deleted": True}
