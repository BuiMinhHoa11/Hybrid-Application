"""One-way, transactional import from the former Node PostgreSQL schema.

The source connection is read-only. Existing target rows are never overwritten.
Use a fresh Python database to preserve every source account and password hash;
reuse-target is an explicit alternative for installations with demo accounts.
"""
from collections import Counter
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .common import dump_json


TABLES = (
    "users", "questions", "exam_papers", "exam_paper_questions", "exams",
    "exam_audience", "exam_sessions", "answers", "submissions", "grading_results",
)
JSON_COLUMNS = {"options", "answers_snapshot", "details"}
USER_REFERENCES = {"owner_id", "student_id", "results_published_by"}


class LegacyImportError(ValueError):
    """An actionable import conflict; the enclosing transaction must roll back."""


def _key(value):
    return str(value) if value is not None else None


def _canonical(value):
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {key: _canonical(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_canonical(item) for item in value]
    return value


def _read(connection, statement, **parameters):
    return [dict(row) for row in connection.execute(text(statement), parameters).mappings()]


def read_legacy(connection: Connection) -> dict[str, list[dict]]:
    """Read a consistent source snapshot. Caller sets the transaction read-only."""
    return {table: _read(connection, f"SELECT * FROM {table}") for table in TABLES}


def _identity(connection):
    return _read(connection, """SELECT current_database() AS database, current_schema() AS schema,
        inet_server_addr()::text AS address, inet_server_port() AS port""")[0]


def _normalize_answer(row, kind):
    selected = row.get("selected_option_ids", row.get("selectedOptionIds", [])) or []
    answer = row.get("text_answer", row.get("textAnswer"))
    if kind == "fill_blank":
        if len(selected) > 1:
            raise LegacyImportError("Câu điền khuyết cũ có nhiều hơn một câu trả lời; cần sửa dữ liệu nguồn trước")
        answer = answer if answer is not None else next(iter(selected), None)
        return [], answer
    if answer is not None:
        raise LegacyImportError("Câu trắc nghiệm cũ chứa text_answer không hợp lệ")
    return selected, None


def _question(row):
    row = dict(row)
    if row["type"] == "fill_blank":
        row["accepted_answers"] = row.get("accepted_answers") or row["correct_option_ids"]
        row["correct_option_ids"] = []
    else:
        row["accepted_answers"] = row.get("accepted_answers") or []
    return row


def prepare_snapshot(source: dict[str, list[dict]]) -> tuple[dict[str, list[dict]], dict]:
    """Translate typed answers and the stronger Python foreign keys, without writes."""
    missing = set(TABLES) - source.keys()
    if missing:
        raise LegacyImportError("Database nguồn thiếu bảng: " + ", ".join(sorted(missing)))
    output = {table: [dict(row) for row in source[table]] for table in TABLES}
    changes = Counter()
    output["questions"] = [_question(row) for row in source["questions"]]
    output["exam_paper_questions"] = [_question(row) for row in source["exam_paper_questions"]]
    for row in output["exam_papers"]:
        row.setdefault("updated_at", row["created_at"])
    exams = {_key(row["id"]): row for row in output["exams"]}
    question_types = {_key(row["id"]): row["type"] for row in output["exam_paper_questions"]}
    question_papers = {_key(row["id"]): _key(row["paper_id"]) for row in output["exam_paper_questions"]}
    for row in output["exams"]:
        row.setdefault("publish_at", None)
        row.setdefault("results_published_by", None)
        if row["results_published"]:
            row["status"] = "closed"
            if row["results_published_by"] is None:
                row["results_published_by"] = row["owner_id"]
                changes["historicalPublisherInferredFromOwner"] += 1
            if row.get("results_published_at") is None:
                raise LegacyImportError(f"Kỳ thi {row['id']} công bố kết quả nhưng thiếu thời điểm công bố")
        else:
            row["results_published_at"] = None
            row["results_published_by"] = None
    audiences = {(_key(row["exam_id"]), _key(row["student_id"])) for row in output["exam_audience"]}
    for row in output["exam_audience"]:
        row.setdefault("assigned_at", exams[_key(row["exam_id"])]["created_at"])
    sessions = {_key(row["id"]): row for row in output["exam_sessions"]}
    for row in output["exam_sessions"]:
        exam = exams[_key(row["exam_id"])]
        row["paper_id"] = exam["paper_id"]
        if row["paper_id"] is None:
            raise LegacyImportError(f"Phiên {row['id']} không có đề thi")
        if exam["results_published"] and row["status"] == "in_progress":
            raise LegacyImportError(f"Kỳ thi {exam['id']} đã công bố nhưng còn phiên đang làm; cần kết thúc ở bản cũ trước")
        membership = (_key(row["exam_id"]), _key(row["student_id"]))
        if membership not in audiences:
            output["exam_audience"].append({"exam_id": row["exam_id"], "student_id": row["student_id"],
                                            "assigned_at": row["started_at"]})
            audiences.add(membership)
            changes["historicalAudienceRestoredFromSession"] += 1
    for row in output["answers"]:
        row["paper_id"] = sessions[_key(row["session_id"])]["paper_id"]
        if question_papers.get(_key(row["question_id"])) != _key(row["paper_id"]):
            raise LegacyImportError(f"Câu trả lời {row['id']} không thuộc đề của phiên thi")
        selected, answer = _normalize_answer(row, question_types[_key(row["question_id"])])
        row["selected_option_ids"], row["text_answer"] = selected, answer
    for row in output["submissions"]:
        session = sessions[_key(row["session_id"])]
        if session["status"] != "submitted" or session.get("submitted_at") is None or not session.get("submit_reason"):
            raise LegacyImportError(f"Bài nộp {row['id']} không có phiên đã nộp hợp lệ")
        seen, snapshot = set(), []
        for answer in row["answers_snapshot"]:
            question_id = answer.get("question_id", answer.get("questionId"))
            if _key(question_id) in seen or question_papers.get(_key(question_id)) != _key(session["paper_id"]):
                raise LegacyImportError(f"Snapshot bài nộp {row['id']} có câu hỏi trùng hoặc ngoài đề")
            seen.add(_key(question_id))
            selected, answer_text = _normalize_answer(answer, question_types[_key(question_id)])
            snapshot.append({"question_id": _key(question_id), "selected_option_ids": selected, "text_answer": answer_text})
        row["answers_snapshot"] = snapshot
        if row["status"] == "grading":
            row.update(status="pending_grading", claimed_at=None, attempts=0, fail_reason=None)
            changes["oldWorkerClaimsRequeued"] += 1
    for row in output["grading_results"]:
        if not row.get("graded_by", "").strip():
            row["graded_by"] = "legacy-node-worker"
            changes["historicalWorkerNameInferred"] += 1
        details = []
        for detail in row["details"]:
            detail = dict(detail)
            question_id = detail.get("questionId", detail.get("question_id"))
            if question_types.get(_key(question_id)) == "fill_blank":
                detail.setdefault("acceptedAnswers", detail.get("correctOptionIds", []))
                detail.setdefault("textAnswer", next(iter(detail.get("selectedOptionIds") or []), None))
            details.append(detail)
        row["details"] = details
    return output, dict(changes)


def import_snapshot(db: Session, source: dict[str, list[dict]], *, user_conflicts: Literal["error", "reuse-target"] = "error") -> dict:
    """Insert into the caller's transaction; never commit, delete or update rows.

    A failed import invalidates this transaction. Its caller must roll it back.
    """
    if user_conflicts not in {"error", "reuse-target"}:
        raise LegacyImportError("user_conflicts phải là error hoặc reuse-target")
    rows, adjustments = prepare_snapshot(source)
    # Serialize imports and block concurrent changes while checking existing rows.
    db.execute(text("SELECT pg_advisory_xact_lock(908125)"))
    db.execute(text("LOCK TABLE " + ", ".join(TABLES) + " IN SHARE ROW EXCLUSIVE MODE"))
    users = _read(db, "SELECT * FROM users")
    by_name = {row["username"].casefold(): row for row in users}
    by_id = {_key(row["id"]): row for row in users}
    user_map, mapped_users = {}, []
    for row in rows["users"]:
        current = by_name.get(row["username"].casefold())
        if current and _key(current["id"]) != _key(row["id"]):
            if user_conflicts != "reuse-target" or current["role"] != row["role"]:
                raise LegacyImportError(f"Tài khoản {row['username']} đã tồn tại với UUID khác. "
                    "Dùng database Python trống để giữ tài khoản cũ, hoặc --user-conflicts reuse-target "
                    "để giữ tài khoản/mật khẩu đích nếu cùng vai trò")
            user_map[_key(row["id"])] = current["id"]
            mapped_users.append({"username": row["username"], "sourceId": _key(row["id"]),
                                 "targetId": _key(current["id"]), "credentials": "keep-target"})
        else:
            if _key(row["id"]) in by_id and by_id[_key(row["id"])]["username"].casefold() != row["username"].casefold():
                raise LegacyImportError(f"users/{row['id']}: UUID đã thuộc tài khoản khác ở đích")
            user_map[_key(row["id"])] = row["id"]
    report = {"inserted": {}, "unchanged": {}, "reusedTargetUsers": len(mapped_users),
              "mappedUsers": mapped_users, "adjustments": adjustments}
    for table in TABLES:
        columns = {row["column_name"] for row in _read(db, """SELECT column_name FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name=:table""", table=table)}
        if not columns:
            raise LegacyImportError(f"Đích thiếu bảng {table}; chạy init-db trong database Python mới trước")
        if table == "exams" and "format" not in columns:
            discarded_formats = sum("format" in row for row in rows[table])
            if discarded_formats:
                adjustments["legacyDisplayFormatReplacedByUnifiedLabel"] = discarded_formats
        inserted = unchanged = 0
        for original in rows[table]:
            if table == "users" and _key(user_map[_key(original["id"])]) != _key(original["id"]):
                continue
            row = {key: value for key, value in original.items() if key in columns}
            for key in USER_REFERENCES & row.keys():
                if row[key] is not None:
                    row[key] = user_map[_key(row[key])]
            keys = ("exam_id", "student_id") if table == "exam_audience" else ("id",)
            predicate = " AND ".join(f"{key}=:{key}" for key in keys)
            existing = _read(db, f"SELECT * FROM {table} WHERE {predicate}", **{key: row[key] for key in keys})
            if existing:
                # A post-import edit is a conflict, never an instruction to overwrite it.
                if any(_canonical(existing[0][key]) != _canonical(value) for key, value in row.items()):
                    raise LegacyImportError(f"{table}/{row.get('id', row.get('exam_id'))}: dữ liệu đích đã khác nguồn; không ghi đè")
                unchanged += 1
                continue
            names = list(row)
            placeholders = [f"CAST(:{key} AS jsonb)" if key in JSON_COLUMNS else f":{key}" for key in names]
            parameters = {key: dump_json(value) if key in JSON_COLUMNS else value for key, value in row.items()}
            try:
                db.execute(text(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({', '.join(placeholders)})"), parameters)
            except IntegrityError as exc:
                constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None) or "database constraint"
                raise LegacyImportError(f"{table}/{row.get('id', row.get('exam_id'))}: vi phạm {constraint}; "
                                        "không có dữ liệu nào được ghi, hãy kiểm tra dữ liệu nguồn/xung đột đích") from None
            inserted += 1
        report["inserted"][table] = inserted
        report["unchanged"][table] = unchanged
    return report


def import_legacy(source_url: str, destination_engine: Engine, *, dry_run: bool = True,
                  user_conflicts: Literal["error", "reuse-target"] = "error") -> dict:
    """Read source with a repeatable-read, read-only transaction and atomically import.

    Dry-run executes the same inserts and database constraints, then rolls them all
    back. No source credentials, hashes or answer content are included in reports.
    """
    url = make_url(source_url.replace("postgres://", "postgresql://", 1)).set(drivername="postgresql+psycopg")
    source_engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5}, hide_parameters=True)
    try:
        with source_engine.connect() as source:
            source.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            identity = _identity(source)
            snapshot = read_legacy(source)
            with destination_engine.connect() as target:
                transaction = target.begin()
                try:
                    if identity == _identity(target):
                        raise LegacyImportError("Nguồn và đích là cùng database/schema; từ chối import")
                    with Session(bind=target, expire_on_commit=False, join_transaction_mode="rollback_only") as db:
                        report = import_snapshot(db, snapshot, user_conflicts=user_conflicts)
                        db.commit()  # External transaction is still owned by this function.
                    if dry_run:
                        transaction.rollback()
                    else:
                        transaction.commit()
                except Exception:
                    transaction.rollback()
                    raise
            source.rollback()
        report["dryRun"] = dry_run
        return report
    finally:
        source_engine.dispose()
