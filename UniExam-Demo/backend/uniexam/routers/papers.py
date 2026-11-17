"""Immutable question snapshots used by exams."""
from random import SystemRandom
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import Field, field_validator, model_validator
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, question_dto
from uniexam.db import get_db, one, many, run
from uniexam.errors import AppError
from uniexam.security import teacher_user, require_owned
from uniexam.routers.questions import scoped_owner

router = APIRouter(tags=["Exam papers"])


class PaperInput(Schema):
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    question_ids: list[UUID] = Field(min_length=1, max_length=300)
    expected_count: int | None = Field(default=None, ge=1, le=300)

    @field_validator("title", "subject")
    @classmethod
    def text_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Không được để trống")
        return value.strip()

    @model_validator(mode="after")
    def unique_questions(self):
        if len(set(self.question_ids)) != len(self.question_ids):
            raise ValueError("Có câu hỏi bị chọn trùng")
        return self


class AutoRule(Schema):
    chapter: str | None = None
    topic: str | None = None
    difficulty: Literal["easy", "medium", "hard", ""] | None = None
    count: int = Field(ge=1, le=100)

    @field_validator("chapter", "topic")
    @classmethod
    def trim_optional(cls, value):
        return value.strip() or None if value is not None else None


class AutoInput(Schema):
    subject: str = Field(min_length=1, max_length=200)
    rules: list[AutoRule] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def cap_total(self):
        if not self.subject.strip() or sum(rule.count for rule in self.rules) > 300:
            raise ValueError("Nhập môn học và chọn tối đa 300 câu")
        self.subject = self.subject.strip()
        return self


def load_paper(db, paper_id, user, lock=False):
    row = one(db, "SELECT * FROM exam_papers WHERE id=:id" + (" FOR UPDATE" if lock else ""), id=paper_id)
    if not row:
        raise AppError(404, "Không tìm thấy đề thi", "NOT_FOUND")
    require_owned(row, user)
    return row


def paper_detail(db, paper_id, user):
    paper = load_paper(db, paper_id, user)
    questions = many(db, "SELECT * FROM exam_paper_questions WHERE paper_id=:id ORDER BY position", id=paper_id)
    return {"paper": dto(paper), "questions": [question_dto(q) for q in questions], "totalPoints": float(sum(q["points"] for q in questions))}


@router.get("/teacher/papers")
def list_papers(db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    rows = many(db, """SELECT p.*, (SELECT count(*)::int FROM exam_paper_questions q WHERE q.paper_id=p.id) AS question_count,
      COALESCE((SELECT sum(points) FROM exam_paper_questions q WHERE q.paper_id=p.id),0) AS total_points,
      EXISTS(SELECT 1 FROM exams e WHERE e.paper_id=p.id) AS in_use
      FROM exam_papers p WHERE CAST(:owner AS uuid) IS NULL OR owner_id=CAST(:owner AS uuid)
      ORDER BY p.created_at DESC, p.id""", owner=scoped_owner(user))
    return {"items": dto(rows)}


@router.post("/teacher/papers/auto-preview")
def auto_preview(body: AutoInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    pool = many(db, """SELECT * FROM questions WHERE subject=:subject
      AND (CAST(:owner AS uuid) IS NULL OR owner_id=CAST(:owner AS uuid))""", subject=body.subject, owner=scoped_owner(user))
    SystemRandom().shuffle(pool)
    slots = [i for i, rule in enumerate(body.rules) for _ in range(rule.count)]
    candidates = []
    for i in slots:
        rule = body.rules[i]
        candidates.append([j for j, q in enumerate(pool) if all(not getattr(rule, key) or q[key] == getattr(rule, key) for key in ("chapter", "topic", "difficulty"))])
    matched: dict[int, int] = {}

    def assign(slot, visited):
        for index in candidates[slot]:
            if index in visited:
                continue
            visited.add(index)
            if index not in matched or assign(matched[index], visited):
                matched[index] = slot
                return True
        return False

    for slot in sorted(range(len(slots)), key=lambda s: len(candidates[s])):
        assign(slot, set())
    chosen = {slot: index for index, slot in matched.items()}
    if len(chosen) != len(slots):
        shortages = []
        for i, rule in enumerate(body.rules):
            available = sum(1 for slot in chosen if slots[slot] == i)
            if available < rule.count:
                shortages.append({"ruleIndex": i, "message": f"Điều kiện {i+1}: cần {rule.count} câu nhưng chỉ chọn được {available} câu"})
        raise AppError(422, "Ngân hàng câu hỏi không đủ câu theo điều kiện", "UNPROCESSABLE", shortages)
    questions = [pool[chosen[slot]] for slot in range(len(slots))]
    return {"questions": [question_dto(q) for q in questions], "totalPoints": float(sum(q["points"] for q in questions))}


@router.post("/teacher/papers", status_code=201)
def create_paper(body: PaperInput, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    if body.expected_count is not None and body.expected_count != len(body.question_ids):
        raise AppError(422, "Số câu hỏi không đúng yêu cầu", "UNPROCESSABLE")
    questions = many(db, """SELECT id FROM questions WHERE id=ANY(CAST(:ids AS uuid[]))
      AND (CAST(:owner AS uuid) IS NULL OR owner_id=CAST(:owner AS uuid)) FOR SHARE""", ids=body.question_ids, owner=scoped_owner(user))
    if len(questions) != len(body.question_ids):
        raise AppError(422, "Có câu hỏi không tồn tại hoặc không thuộc ngân hàng của bạn", "UNPROCESSABLE")
    paper = one(db, """INSERT INTO exam_papers(owner_id,title,subject,description)
      VALUES (:owner,:title,:subject,:description) RETURNING *""", owner=user["id"], title=body.title, subject=body.subject, description=body.description.strip())
    run(db, """INSERT INTO exam_paper_questions(paper_id,question_id,position,type,content,options,correct_option_ids,
      accepted_answers,points,chapter,topic,difficulty)
      SELECT :paper,q.id,u.position,q.type,q.content,q.options,q.correct_option_ids,q.accepted_answers,q.points,q.chapter,q.topic,q.difficulty
      FROM unnest(CAST(:ids AS uuid[])) WITH ORDINALITY AS u(id,position) JOIN questions q ON q.id=u.id""", paper=paper["id"], ids=body.question_ids)
    return paper_detail(db, paper["id"], user)


@router.get("/teacher/papers/{paper_id}")
def get_paper(paper_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    return paper_detail(db, paper_id, user)


@router.delete("/teacher/papers/{paper_id}")
def delete_paper(paper_id: UUID, db: Session = Depends(get_db, scope="function"), user=Depends(teacher_user, scope="function")):
    load_paper(db, paper_id, user, lock=True)
    if one(db, "SELECT id FROM exams WHERE paper_id=:id LIMIT 1", id=paper_id):
        raise AppError(409, "Đề đang được sử dụng trong kỳ thi nên không thể xóa", "PAPER_IN_USE")
    run(db, "DELETE FROM exam_papers WHERE id=:id", id=paper_id)
    return {"deleted": True}
