"""Admin-only, durable fullscreen alerts delivered over an authenticated SSE stream."""
import asyncio
import json

import jwt
from fastapi import APIRouter, Depends, Path, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from uniexam.common import Schema, dto, now_utc
from uniexam.config import settings
from uniexam.db import SessionLocal, get_db, many, one, run
from uniexam.errors import AppError
from uniexam.security import admin_user, bearer

router = APIRouter(prefix="/admin/exam-alerts", tags=["Admin exam alerts"])


def alert_snapshot(db, admin_id):
    now = now_utc()
    active = many(db, """SELECT s.id AS session_id, e.id AS exam_id, e.title AS exam_title,
        u.id AS student_id, u.username, u.full_name,
        last_event.client_time AS exited_at, last_event.received_at,
        (SELECT count(*)::int FROM exam_session_events ev
          WHERE ev.session_id=s.id AND ev.type='fullscreen_exit') AS exit_count
        FROM exam_sessions s
        JOIN exams e ON e.id=s.exam_id
        JOIN users u ON u.id=s.student_id
        JOIN LATERAL (
          SELECT ev.type, ev.client_time, ev.received_at FROM exam_session_events ev
          WHERE ev.session_id=s.id
          ORDER BY ev.client_time DESC, ev.received_at DESC, ev.id DESC LIMIT 1
        ) last_event ON true
        WHERE s.status='in_progress' AND s.expires_at>:now AND last_event.type='fullscreen_exit'
        ORDER BY last_event.client_time DESC, s.id""", now=now)
    outside = {row["session_id"] for row in active}
    items = many(db, """SELECT a.id::text AS id, a.event_id, a.created_at,
        s.id AS session_id, e.id AS exam_id, e.title AS exam_title,
        u.id AS student_id, u.username, u.full_name,
        ev.client_time, ev.received_at, r.read_at, s.status AS session_status, s.expires_at,
        (count(*) FILTER (WHERE r.alert_id IS NULL) OVER ())::int AS unread_count,
        (max(a.id) OVER ())::text AS latest_id
        FROM admin_exam_alerts a
        JOIN exam_session_events ev ON ev.id=a.event_id
        JOIN exam_sessions s ON s.id=ev.session_id
        JOIN exams e ON e.id=s.exam_id
        JOIN users u ON u.id=s.student_id
        LEFT JOIN admin_exam_alert_reads r ON r.alert_id=a.id AND r.admin_id=:admin
        ORDER BY a.id DESC LIMIT 50""", admin=admin_id)
    summary = {"unread_count": items[0]["unread_count"] if items else 0,
               "latest_id": items[0]["latest_id"] if items else "0"}
    for item in items:
        item.pop("unread_count")
        item.pop("latest_id")
        status, expires = item.pop("session_status"), item.pop("expires_at")
        item["current_status"] = ("ended" if status != "in_progress" or expires <= now else
                                  "outside" if item["session_id"] in outside else "fullscreen")
    return dto({**summary, "items": items, "active_sessions": active})


def stream_snapshot(admin_id, expires_at):
    # Each iteration releases its DB connection. Never keep a transaction open for SSE.
    if now_utc().timestamp() >= expires_at:
        return None
    with SessionLocal.begin() as db:
        user = one(db, "SELECT role, is_active FROM users WHERE id=:id", id=admin_id)
        if not user or not user["is_active"] or user["role"] != "admin":
            return None
        return alert_snapshot(db, admin_id)


POLL_SECONDS = 2  # VM private chạy giả lập, chậm: 2 giây/lần đủ nhanh mà nhẹ cho PostgreSQL
HEARTBEAT_SECONDS = 15  # < 45 giây (watchdog phía web) và < 60 giây (proxy_read_timeout của Nginx)


async def alert_events(request, admin_id, expires_at):
    previous = None
    ticks = 0
    while not await request.is_disconnected():
        try:
            snapshot = await asyncio.to_thread(stream_snapshot, admin_id, expires_at)
        except SQLAlchemyError:
            yield 'event: unavailable\ndata: {}\n\n'
            return
        if snapshot is None:
            yield 'event: auth-expired\ndata: {}\n\n'
            return
        serialized = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        if serialized != previous:
            yield f"event: alerts\ndata: {serialized}\n\n"
            previous = serialized
        elif ticks % max(1, HEARTBEAT_SECONDS // POLL_SECONDS) == 0:
            yield ': heartbeat\n\n'
        ticks += 1
        await asyncio.sleep(POLL_SECONDS)


@router.get("")
def list_alerts(response: Response, db: Session = Depends(get_db, scope="function"),
                user=Depends(admin_user, scope="function")):
    response.headers["Cache-Control"] = "no-store"
    return alert_snapshot(db, user["id"])


@router.get("/stream")
def alerts_stream(request: Request, user=Depends(admin_user, scope="function"), credentials=Depends(bearer)):
    try:
        claims = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"], issuer="uniexam-python")
    except jwt.InvalidTokenError:
        raise AppError(401, "Phiên đăng nhập đã hết hạn", "UNAUTHORIZED") from None
    return StreamingResponse(alert_events(request, user["id"], claims["exp"]), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})


class ReadAll(Schema):
    through_id: int = Field(ge=1, le=9223372036854775807)


@router.post("/read-all")
def read_all(body: ReadAll, db: Session = Depends(get_db, scope="function"), user=Depends(admin_user, scope="function")):
    run(db, """INSERT INTO admin_exam_alert_reads(admin_id,alert_id)
        SELECT :admin,a.id FROM admin_exam_alerts a WHERE a.id<=:through
        ON CONFLICT(admin_id,alert_id) DO NOTHING""", admin=user["id"], through=body.through_id)
    return alert_snapshot(db, user["id"])


@router.post("/{alert_id}/read")
def read_alert(alert_id: int = Path(ge=1, le=9223372036854775807),
               db: Session = Depends(get_db, scope="function"), user=Depends(admin_user, scope="function")):
    if not one(db, "SELECT id FROM admin_exam_alerts WHERE id=:id", id=alert_id):
        raise AppError(404, "Không tìm thấy cảnh báo", "NOT_FOUND")
    run(db, """INSERT INTO admin_exam_alert_reads(admin_id,alert_id) VALUES (:admin,:id)
        ON CONFLICT(admin_id,alert_id) DO NOTHING""", admin=user["id"], id=alert_id)
    return alert_snapshot(db, user["id"])
