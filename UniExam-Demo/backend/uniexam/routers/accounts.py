from time import perf_counter
from typing import Literal
from uuid import UUID
import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import EmailStr, Field
from sqlalchemy.orm import Session
from ..common import Schema, dto, now_utc
from ..config import settings
from ..db import get_db, one, many, run
from ..errors import AppError
from ..security import current_user, admin_user, hash_password, verify_password, dummy_hash, issue_token

router = APIRouter()
Role = Literal["student", "teacher", "admin"]
USER_COLUMNS = "id, username, full_name, email, role, is_active, created_at, updated_at"


class Login(Schema):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class CreateUser(Schema):
    username: str = Field(pattern=r"^[a-zA-Z0-9._-]{3,50}$")
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    role: Role
    password: str = Field(min_length=8, max_length=200)


class UpdateUser(Schema):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    role: Role | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db, scope="function")):
    user = one(db, "SELECT * FROM users WHERE lower(username) = lower(:username)", username=body.username.strip())
    ok = verify_password(body.password, user["password_hash"] if user else dummy_hash)
    if not user or not ok:
        raise AppError(401, "Sai tên đăng nhập hoặc mật khẩu", "UNAUTHORIZED")
    if not user["is_active"]:
        raise AppError(403, "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên", "FORBIDDEN")
    return {"token": issue_token(user), "user": dto({k: user[k] for k in ("id", "username", "full_name", "role")})}


@router.get("/auth/me")
def me(user=Depends(current_user, scope="function")):
    return dto({key: user[key] for key in USER_COLUMNS.split(", ")})


@router.get("/admin/users")
def list_users(q: str = "", role: str = "", active: str = "", page: int = Query(1, ge=1),
               page_size: int = Query(20, alias="pageSize", ge=1, le=100),
               db: Session = Depends(get_db, scope="function"), _admin=Depends(admin_user, scope="function")):
    if role not in {"", "student", "teacher", "admin"} or active not in {"", "true", "false"}:
        raise AppError(422, "Bộ lọc không hợp lệ", "VALIDATION_ERROR")
    clause = "WHERE (:q = '' OR username ILIKE :search OR full_name ILIKE :search OR email ILIKE :search) AND (:role = '' OR role = :role)"
    params = {"q": q, "search": f"%{q}%", "role": role}
    if active:
        clause += " AND is_active = :active"
        params["active"] = active == "true"
    total = one(db, f"SELECT count(*) AS n FROM users {clause}", **params)["n"]
    rows = many(db, f"SELECT {USER_COLUMNS} FROM users {clause} ORDER BY created_at DESC, id LIMIT :limit OFFSET :offset",
                **params, limit=page_size, offset=(page - 1) * page_size)
    return dto({"items": rows, "total": total, "page": page, "page_size": page_size})


@router.get("/admin/users/{user_id}")
def user_detail(user_id: UUID, db: Session = Depends(get_db, scope="function"), _admin=Depends(admin_user, scope="function")):
    user = one(db, f"SELECT {USER_COLUMNS} FROM users WHERE id = :id", id=user_id)
    if not user:
        raise AppError(404, "Không tìm thấy tài khoản", "NOT_FOUND")
    user["stats"] = one(db, """SELECT
      (SELECT count(*) FROM questions WHERE owner_id=:id) AS questions,
      (SELECT count(*) FROM exams WHERE owner_id=:id) AS exams,
      (SELECT count(*) FROM exam_sessions WHERE student_id=:id) AS sessions""", id=user_id)
    return dto(user)


def check_email(db, role, email, user_id=None):
    """Sinh viên bắt buộc có email (để nhận lịch thi); email không được trùng tài khoản khác."""
    if role == "student" and not email:
        raise AppError(422, "Tài khoản sinh viên bắt buộc có email để nhận thông báo lịch thi", "VALIDATION_ERROR",
                       [{"field": "email", "message": "Nhập email của sinh viên"}])
    if email and one(db, "SELECT 1 AS x FROM users WHERE lower(email)=lower(:email) AND (CAST(:id AS uuid) IS NULL OR id<>:id)",
                     email=email, id=user_id):
        raise AppError(409, "Email này đã được dùng cho tài khoản khác", "DUPLICATE",
                       [{"field": "email", "message": "Email đã tồn tại"}])


@router.post("/admin/users", status_code=201)
def create_user(body: CreateUser, db: Session = Depends(get_db, scope="function"), _admin=Depends(admin_user, scope="function")):
    if not body.full_name.strip():
        raise AppError(422, "Nhập họ tên", "VALIDATION_ERROR")
    email = str(body.email) if body.email else None
    check_email(db, body.role, email)
    user = one(db, f"""INSERT INTO users(username,full_name,email,role,password_hash)
      VALUES (:username,:name,:email,:role,:password) RETURNING {USER_COLUMNS}""",
      username=body.username, name=body.full_name.strip(), email=email,
      role=body.role, password=hash_password(body.password))
    return dto(user)


def protect_admin(db, target, actor, *, role=None, active=None):
    if target["id"] == actor["id"] and (active is False or (role and role != target["role"])):
        raise AppError(409, "Không thể tự khóa hoặc đổi vai trò của mình", "SELF_UPDATE")
    if target["role"] == "admin" and target["is_active"] and (active is False or (role and role != "admin")):
        count = one(db, "SELECT count(*) AS n FROM users WHERE role='admin' AND is_active")["n"]
        if count <= 1:
            raise AppError(409, "Phải giữ ít nhất một quản trị viên đang hoạt động", "LAST_ADMIN")


@router.put("/admin/users/{user_id}")
def update_user(user_id: UUID, body: UpdateUser, db: Session = Depends(get_db, scope="function"), actor=Depends(admin_user, scope="function")):
    run(db, "SELECT pg_advisory_xact_lock(908122)")
    target = one(db, "SELECT * FROM users WHERE id=:id FOR UPDATE", id=user_id)
    if not target:
        raise AppError(404, "Không tìm thấy tài khoản", "NOT_FOUND")
    values = body.model_dump(exclude_unset=True)
    if any(value is None for key, value in values.items() if key != "email"):
        raise AppError(422, "Trường cập nhật không được để null", "VALIDATION_ERROR")
    protect_admin(db, target, actor, role=body.role)
    if "password" in values:
        values["password_hash"] = hash_password(values.pop("password"))
    if "full_name" in values:
        values["full_name"] = values["full_name"].strip()
        if not values["full_name"]:
            raise AppError(422, "Nhập họ tên", "VALIDATION_ERROR")
    if "email" in values and values["email"]:
        values["email"] = str(values["email"])
    if "email" in values or "role" in values:
        check_email(db, values.get("role", target["role"]), values.get("email", target["email"]), user_id)
    if values:
        # Column names come only from the fixed Pydantic model, never from raw input.
        sets = ", ".join(f"{key}=:{key}" for key in values)
        run(db, f"UPDATE users SET {sets} WHERE id=:target", **values, target=user_id)
    return dto(one(db, f"SELECT {USER_COLUMNS} FROM users WHERE id=:id", id=user_id))


def set_active(user_id, active, db, actor):
    run(db, "SELECT pg_advisory_xact_lock(908122)")
    target = one(db, "SELECT * FROM users WHERE id=:id FOR UPDATE", id=user_id)
    if not target:
        raise AppError(404, "Không tìm thấy tài khoản", "NOT_FOUND")
    protect_admin(db, target, actor, active=active)
    return dto(one(db, f"UPDATE users SET is_active=:active WHERE id=:id RETURNING {USER_COLUMNS}", id=user_id, active=active))


@router.delete("/admin/users/{user_id}")
def delete_user(user_id: UUID, db: Session = Depends(get_db, scope="function"), actor=Depends(admin_user, scope="function")):
    """Xóa hẳn tài khoản chưa có dữ liệu. Tài khoản đã có dữ liệu thi thì chỉ được khóa, để giữ lịch sử bài làm và điểm."""
    run(db, "SELECT pg_advisory_xact_lock(908122)")
    target = one(db, "SELECT * FROM users WHERE id=:id FOR UPDATE", id=user_id)
    if not target:
        raise AppError(404, "Không tìm thấy tài khoản", "NOT_FOUND")
    if target["id"] == actor["id"]:
        raise AppError(409, "Không thể tự xóa tài khoản của mình", "SELF_UPDATE")
    if target["role"] == "admin" and target["is_active"]:
        if one(db, "SELECT count(*) AS n FROM users WHERE role='admin' AND is_active")["n"] <= 1:
            raise AppError(409, "Phải giữ ít nhất một quản trị viên đang hoạt động", "LAST_ADMIN")
    usage = one(db, """SELECT
      (SELECT count(*) FROM questions WHERE owner_id=:id)::int AS questions,
      (SELECT count(*) FROM exam_papers WHERE owner_id=:id)::int AS papers,
      (SELECT count(*) FROM exams WHERE owner_id=:id OR results_published_by=:id)::int AS exams,
      (SELECT count(*) FROM exam_sessions WHERE student_id=:id)::int AS attempts""", id=user_id)
    labels = {"questions": "câu hỏi", "papers": "đề thi", "exams": "kỳ thi", "attempts": "lượt làm bài"}
    in_use = [f"{count} {labels[key]}" for key, count in usage.items() if count]
    if in_use:
        raise AppError(409, f"Tài khoản đang có dữ liệu ({', '.join(in_use)}) nên không thể xóa. Hãy dùng chức năng Khóa để chặn đăng nhập.",
                       "IN_USE", dto(usage))
    # Sinh viên chưa làm bài: gỡ khỏi danh sách dự thi (email lịch thi đang chờ tự hủy theo ON DELETE CASCADE).
    run(db, "DELETE FROM exam_audience WHERE student_id=:id", id=user_id)
    run(db, "DELETE FROM users WHERE id=:id", id=user_id)
    return {"deleted": True}


@router.post("/admin/users/{user_id}/lock")
def lock_user(user_id: UUID, db: Session = Depends(get_db, scope="function"), actor=Depends(admin_user, scope="function")):
    return set_active(user_id, False, db, actor)


@router.post("/admin/users/{user_id}/unlock")
def unlock_user(user_id: UUID, db: Session = Depends(get_db, scope="function"), actor=Depends(admin_user, scope="function")):
    return set_active(user_id, True, db, actor)


@router.get("/admin/system-status")
def system_status(db: Session = Depends(get_db, scope="function"), _admin=Depends(admin_user, scope="function")):
    started = perf_counter()
    one(db, "SELECT 1 AS ok")
    services = [{"name": "database", "status": "up", "latencyMs": round((perf_counter()-started)*1000)}]
    for name, url in [("public-api", settings.public_api_url), ("private-api", settings.private_api_url),
                      ("grading-worker", settings.worker_url), ("frontend", settings.frontend_url)]:
        started = perf_counter()
        try:
            response = httpx.get(f"{url}/health", timeout=2)
            status = "up" if response.is_success else "down"
        except httpx.HTTPError:
            status = "down"
        services.append({"name": name, "status": status, "latencyMs": round((perf_counter()-started)*1000)})
    return {"overall": "ok" if all(s["status"] == "up" for s in services) else "degraded", "checkedAt": now_utc().isoformat(), "services": services}
