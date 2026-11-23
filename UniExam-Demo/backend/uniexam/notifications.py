"""Email thông báo lịch thi.

Khi giáo viên phát hành kỳ thi, mỗi sinh viên có email được thêm một dòng vào bảng
email_notifications (cùng transaction với việc phát hành). Vòng nền của private-api
gọi send_due_batch() để gửi các dòng đã đến giờ (giờ công bố, hoặc ngay lập tức) qua SMTP.
"""
import logging
import smtplib
import ssl
import time
from datetime import timedelta, timezone
from email.message import EmailMessage

from sqlalchemy.orm import Session

from .common import now_utc
from .config import settings
from .db import SessionLocal, one, run

logger = logging.getLogger("uniexam.notifications")
VN_TZ = timezone(timedelta(hours=7))  # Việt Nam không có giờ mùa hè
MAX_ATTEMPTS = 3
BATCH_SIZE = 50


def queue_schedule_emails(db: Session, exam: dict) -> dict:
    """Xếp email lịch thi cho mọi sinh viên dự thi; gọi trong transaction phát hành."""
    if not settings.email_enabled:
        return {"enabled": False, "queued": 0, "missingEmail": 0}
    counts = one(db, """WITH audience AS (
        SELECT u.id, u.email FROM exam_audience a JOIN users u ON u.id = a.student_id
        WHERE a.exam_id = :exam AND u.is_active
      ), queued AS (
        INSERT INTO email_notifications (exam_id, student_id, kind, send_after)
        SELECT :exam, id, 'schedule', COALESCE(CAST(:publish_at AS timestamptz), now()) FROM audience WHERE email IS NOT NULL
        ON CONFLICT (exam_id, student_id, kind) DO NOTHING
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM queued)::int AS queued,
             (SELECT count(*) FROM audience WHERE email IS NULL)::int AS missing_email""",
        exam=exam["id"], publish_at=exam["publish_at"])
    return {"enabled": True, "queued": counts["queued"], "missingEmail": counts["missing_email"]}


def _one_line(value: str) -> str:
    return " ".join(str(value).split())


def _vn_time(value) -> str:
    return value.astimezone(VN_TZ).strftime("%H:%M ngày %d/%m/%Y")


def build_schedule_message(row: dict) -> EmailMessage:
    link = f"{settings.app_public_url.rstrip('/')}/student/exams/{row['exam_id']}"
    lines = [
        f"Chào {_one_line(row['full_name'])},",
        "",
        "Bạn có lịch thi mới trên UniExam:",
        "",
        f"  Kỳ thi:      {_one_line(row['title'])}",
        f"  Môn học:     {_one_line(row['subject'])}",
        f"  Bắt đầu:     {_vn_time(row['start_time'])} (giờ Việt Nam)",
        f"  Kết thúc:    {_vn_time(row['end_time'])} (giờ Việt Nam)",
        f"  Thời lượng:  {row['duration_minutes']} phút",
        f"  Số câu hỏi:  {row['question_count']}",
    ]
    if row["description"].strip():
        lines += ["", "Ghi chú của giáo viên:", row["description"].strip()]
    lines += [
        "",
        "Bạn chỉ vào làm bài được trong khung giờ trên. Hết thời lượng, hệ thống tự nộp bài.",
        f"Xem chi tiết: {link}",
        "",
        "Email này được gửi tự động, vui lòng không trả lời.",
    ]
    message = EmailMessage()
    message["Subject"] = f"[UniExam] Lịch thi: {_one_line(row['title'])}"
    message["From"] = settings.mail_from
    message["To"] = row["email"]
    message.set_content("\n".join(lines))
    return message


def smtp_connect() -> smtplib.SMTP:
    context = ssl.create_default_context()
    if settings.smtp_ssl:
        client = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=context)
    else:
        client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        if settings.smtp_starttls:
            client.starttls(context=context)
    if settings.smtp_user:
        client.login(settings.smtp_user, settings.smtp_password)
    return client


DUE_SQL = """SELECT n.id, n.attempts, n.exam_id, u.email, u.full_name, u.is_active,
    e.title, e.subject, e.description, e.start_time, e.end_time, e.duration_minutes, e.question_count
  FROM email_notifications n
  JOIN users u ON u.id = n.student_id
  JOIN exams e ON e.id = n.exam_id
  WHERE n.status = 'pending' AND n.send_after <= now()
  ORDER BY n.send_after, n.id
  LIMIT 1
  FOR UPDATE OF n SKIP LOCKED"""


def send_due_batch() -> int:
    """Gửi tối đa BATCH_SIZE email đã đến giờ. Dừng ngay khi SMTP lỗi để không dồn lỗi."""
    sent = 0
    client = None
    try:
        for _ in range(BATCH_SIZE):
            with SessionLocal.begin() as db:
                row = one(db, DUE_SQL)
                if not row:
                    break
                if not row["email"] or not row["is_active"] or row["end_time"] <= now_utc():
                    run(db, "UPDATE email_notifications SET status = 'skipped' WHERE id = :id", id=row["id"])
                    continue
                try:
                    if client is None:
                        client = smtp_connect()
                    elif settings.email_send_interval_seconds:
                        time.sleep(settings.email_send_interval_seconds)
                    client.send_message(build_schedule_message(row))
                except Exception as exc:
                    attempts = row["attempts"] + 1
                    run(db, """UPDATE email_notifications
                        SET attempts = :attempts, last_error = :error,
                            status = CASE WHEN :attempts >= :max THEN 'failed' ELSE 'pending' END,
                            send_after = now() + CAST(:attempts AS integer) * interval '1 minute'
                        WHERE id = :id""",
                        id=row["id"], attempts=attempts, max=MAX_ATTEMPTS, error=f"{type(exc).__name__}: {exc}"[:500])
                    logger.warning("Gửi email thất bại (lần %s): %s", attempts, type(exc).__name__)
                    break
                run(db, """UPDATE email_notifications
                    SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL
                    WHERE id = :id""", id=row["id"])
                sent += 1
    finally:
        if client is not None:
            try:
                client.quit()
            except Exception:
                pass
    return sent
