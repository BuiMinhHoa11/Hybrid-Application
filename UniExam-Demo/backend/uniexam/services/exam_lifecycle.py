"""Idempotent lifecycle tick; invoked periodically by the exam API lifespan."""
from sqlalchemy.orm import Session

from uniexam.db import many, run
from uniexam.routers.sessions import finalize_session


def tick(db: Session) -> dict:
    opened = many(db, """UPDATE exams SET status = 'open'
        WHERE status = 'published' AND start_time <= clock_timestamp() AND end_time > clock_timestamp()
          AND NOT results_published RETURNING id""")
    locked = many(db, """UPDATE exams SET status = 'locked'
        WHERE status IN ('published', 'open') AND end_time <= clock_timestamp() RETURNING id""")
    expired = many(db, """SELECT id FROM exam_sessions WHERE status = 'in_progress' AND expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED""")
    auto_submitted = 0
    for row in expired:
        result = finalize_session(db, row["id"], "timeout")
        if result and not result["alreadySubmitted"]:
            auto_submitted += 1
    closed = many(db, """UPDATE exams e SET status = 'closed' WHERE status = 'locked'
        AND NOT EXISTS (SELECT 1 FROM exam_sessions ss WHERE ss.exam_id = e.id AND ss.status = 'in_progress')
        RETURNING e.id""")
    return {"opened": len(opened), "locked": len(locked), "autoSubmitted": auto_submitted, "closed": len(closed)}
