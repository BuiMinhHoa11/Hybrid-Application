import hmac
from datetime import timedelta
from uuid import UUID
import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db, one
from .errors import AppError
from .common import now_utc

hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)
dummy_hash = hasher.hash("uniexam-dummy-password-not-an-account")


def hash_password(value: str):
    return hasher.hash(value)


def verify_password(value: str, hashed: str):
    try:
        if hashed.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(value.encode(), hashed.encode())
        return hasher.verify(hashed, value)
    except (InvalidHashError, VerificationError, ValueError):
        return False


def issue_token(user):
    now = now_utc()
    return jwt.encode({"sub": str(user["id"]), "role": user["role"], "iat": now,
                       "exp": now + timedelta(hours=settings.jwt_lifetime_hours), "iss": "uniexam-python"},
                      settings.jwt_secret, algorithm="HS256")


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db, scope="function")):
    if credentials is None:
        raise AppError(401, "Chưa đăng nhập hoặc phiên đã hết hạn", "UNAUTHORIZED")
    try:
        claims = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"],
                            issuer="uniexam-python", options={"require": ["sub", "exp", "iat"]})
        user_id = UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise AppError(401, "Phiên đăng nhập không hợp lệ", "UNAUTHORIZED") from None
    user = one(db, "SELECT * FROM users WHERE id = :id", id=user_id)
    if not user or not user["is_active"]:
        raise AppError(401, "Tài khoản không hoạt động", "UNAUTHORIZED")
    return user


def teacher_user(user=Depends(current_user, scope="function")):
    if user["role"] not in {"teacher", "admin"}:
        raise AppError(403, "Bạn không có quyền thực hiện thao tác này", "FORBIDDEN")
    return user


def student_user(user=Depends(current_user, scope="function")):
    if user["role"] != "student":
        raise AppError(403, "Chỉ sinh viên được làm bài", "FORBIDDEN")
    return user


def admin_user(user=Depends(current_user, scope="function")):
    if user["role"] != "admin":
        raise AppError(403, "Chỉ quản trị viên có quyền", "FORBIDDEN")
    return user


def require_owned(row, user):
    if not row:
        raise AppError(404, "Không tìm thấy dữ liệu", "NOT_FOUND")
    if user["role"] != "admin" and row["owner_id"] != user["id"]:
        raise AppError(403, "Bạn không có quyền với dữ liệu này", "FORBIDDEN")
    return row


def internal_access(x_internal_api_key: str | None = Header(default=None)):
    if not x_internal_api_key or not hmac.compare_digest(x_internal_api_key.encode(), settings.internal_api_key.encode()):
        raise AppError(401, "Khóa nội bộ không hợp lệ", "UNAUTHORIZED")
