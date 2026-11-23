"""Gateway EC2: giữ tạm bài nộp trên S3 khi OpenStack (private-api) không trả lời.

Chỉ dùng khi có sự cố: bình thường bài đi thẳng về private-api và S3 không có dữ liệu nào.
- Bài được mã hóa AES-256-GCM trước khi rời gateway. Khóa (OFFLINE_BUFFER_KEY) chỉ nằm trong .env
  của EC2, không nằm trên S3, nên S3 chỉ giữ dữ liệu không đọc được.
- Vòng chuyển về (relay_once) chạy định kỳ: private-api trả lời lại thì gửi bài qua
  /internal/offline-relay, thành công thì xóa khỏi S3.
- Bài bị private-api từ chối hẳn (đã công bố kết quả, quá hạn...) được chuyển sang
  OFFLINE_BUFFER_REJECTED_PREFIX (vẫn mã hóa) để quản trị viên xử lý tay, không mất bài.

Chỉ chạy trên gateway: không import database. boto3/cryptography được import khi cần.
"""
import base64
import json
import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

import httpx
import jwt

from .config import settings
from .offline_schema import OfflineSubmit

log = logging.getLogger("uniexam.offline_buffer")

MAGIC = b"UXB1"  # phiên bản định dạng: MAGIC | nonce 12 byte | ciphertext + tag
AAD = b"uniexam-offline-buffer-v1"
_s3_client = None


def enabled() -> bool:
    return bool(settings.offline_buffer_bucket)


def _cipher():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM(base64.b64decode(settings.offline_buffer_key))


def encrypt(record: dict) -> bytes:
    nonce = secrets.token_bytes(12)
    plain = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode()
    return MAGIC + nonce + _cipher().encrypt(nonce, plain, AAD)


def decrypt(blob: bytes) -> dict:
    if blob[:4] != MAGIC or len(blob) < 4 + 12 + 16:
        raise ValueError("Không đúng định dạng bài giữ tạm")
    return json.loads(_cipher().decrypt(blob[4:16], blob[16:], AAD))


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3  # dùng IAM role của EC2, không cần khóa AWS trong .env
        _s3_client = boto3.client("s3", region_name=settings.aws_region)
    return _s3_client


def student_from_token(authorization: str | None) -> UUID | None:
    """Gateway tự kiểm tra JWT (cùng JWT_SECRET với private) để chỉ sinh viên đăng nhập mới gửi được."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        claims = jwt.decode(authorization[7:].strip(), settings.jwt_secret, algorithms=["HS256"],
                            issuer="uniexam-python", options={"require": ["sub", "exp", "iat"]})
        return UUID(claims["sub"]) if claims.get("role") == "student" else None
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        return None


def _key(session_id: UUID) -> str:
    return f"{settings.offline_buffer_prefix}{session_id}.bin"


def store(session_id: UUID, student_id: UUID, submission: OfflineSubmit) -> None:
    """Ghi (hoặc ghi đè) bài của một phiên. Giữ mốc nhận bài sớm nhất nếu sinh viên gửi lại nhiều lần."""
    s3 = _s3()
    received_at = datetime.now(timezone.utc).isoformat()
    try:
        previous = decrypt(s3.get_object(Bucket=settings.offline_buffer_bucket, Key=_key(session_id))["Body"].read())
        if previous.get("studentId") == str(student_id):
            received_at = previous.get("receivedAt", received_at)
    except Exception:  # chưa có bản nào (NoSuchKey) hoặc bản cũ hỏng: dùng mốc hiện tại
        pass
    record = {"sessionId": str(session_id), "studentId": str(student_id), "receivedAt": received_at,
              "submission": submission.model_dump(mode="json", by_alias=True)}
    s3.put_object(Bucket=settings.offline_buffer_bucket, Key=_key(session_id), Body=encrypt(record),
                  ContentType="application/octet-stream", ServerSideEncryption="AES256")
    log.warning("Private-api không trả lời: đã giữ tạm bài của phiên %s trên S3", session_id)


def _reject(key: str, reason: str) -> None:
    s3 = _s3()
    target = settings.offline_buffer_rejected_prefix + key[len(settings.offline_buffer_prefix):]
    s3.copy_object(Bucket=settings.offline_buffer_bucket, Key=target, ServerSideEncryption="AES256",
                   CopySource={"Bucket": settings.offline_buffer_bucket, "Key": key})
    s3.delete_object(Bucket=settings.offline_buffer_bucket, Key=key)
    log.error("Private-api từ chối bài giữ tạm %s (%s); đã chuyển sang %s", key, reason, target)


def relay_once() -> int:
    """Chuyển các bài đang giữ trên S3 về private-api. Trả về số bài đã chuyển xong."""
    s3 = _s3()
    listing = s3.list_objects_v2(Bucket=settings.offline_buffer_bucket, Prefix=settings.offline_buffer_prefix, MaxKeys=100)
    moved = 0
    for item in listing.get("Contents", []):
        key = item["Key"]
        if not key.endswith(".bin"):
            continue
        try:
            record = decrypt(s3.get_object(Bucket=settings.offline_buffer_bucket, Key=key)["Body"].read())
        except Exception as exc:
            _reject(key, f"không giải mã được: {type(exc).__name__}")
            continue
        try:
            response = httpx.post(f"{settings.private_api_url.rstrip('/')}/internal/offline-relay",
                                  headers={"X-Internal-Api-Key": settings.internal_api_key},
                                  json={"sessionId": record["sessionId"], "studentId": record["studentId"],
                                        "receivedAt": record["receivedAt"], "submission": record["submission"]},
                                  timeout=120.0)
        except httpx.HTTPError:
            return moved  # private-api vẫn chưa trả lời: để vòng sau
        if response.status_code < 300:
            s3.delete_object(Bucket=settings.offline_buffer_bucket, Key=key)
            moved += 1
            log.warning("Đã chuyển bài giữ tạm của phiên %s về private-api", record["sessionId"])
        elif response.status_code in (400, 404, 409, 422):
            _reject(key, f"HTTP {response.status_code}: {response.text[:300]}")
        else:
            # private-api lỗi tạm thời (5xx) hoặc sai INTERNAL_API_KEY (401): thử lại vòng sau.
            log.warning("Chưa chuyển được bài giữ tạm %s: HTTP %s", key, response.status_code)
            return moved
    return moved
