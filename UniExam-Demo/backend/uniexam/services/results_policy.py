"""Publication decisions shared by the result read and write endpoints.

The database counts include *assigned* students, rather than just students who
have started.  A teacher must explicitly publish; this module never writes data.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

VN_TZ = timezone(timedelta(hours=7))


def publication_policy(exam: dict[str, Any], state: dict[str, Any], now: datetime) -> dict[str, Any]:
    def blocked(code: str, message: str) -> dict[str, Any]:
        return {"can_publish": False, "early": False, "code": code, "blocked_reason": message}

    if exam["results_published"]:
        return blocked("ALREADY_PUBLISHED", "Kết quả kỳ thi này đã được công bố")
    if exam["status"] not in {"published", "open", "locked", "closed"}:
        return blocked("EXAM_NOT_PUBLISHED", "Kỳ thi chưa được phát hành")
    if state["open_sessions"]:
        return blocked("EXAM_IN_PROGRESS", f"Còn {state['open_sessions']} thí sinh đang làm bài")
    wait_until = state.get("offline_wait_until")
    if wait_until and wait_until > now:
        return blocked(
            "OFFLINE_SYNC_WINDOW",
            "Có bài bị tự nộp do hết giờ; thí sinh đó có thể đang mất mạng và máy sẽ tự gửi bài đầy đủ khi có mạng lại. "
            f"Hãy công bố sau {wait_until.astimezone(VN_TZ).strftime('%H:%M ngày %d/%m/%Y')}.",
        )

    ended = exam["status"] == "closed" or exam["end_time"] <= now
    if not ended and (state["audience"] == 0 or state["submitted"] < state["audience"]):
        return blocked(
            "EXAM_NOT_CLOSED",
            f"Mới có {state['submitted']}/{state['audience']} thí sinh nộp bài. "
            "Chỉ công bố sớm khi tất cả thí sinh đã nộp; nếu có người vắng, hãy chờ kỳ thi kết thúc.",
        )
    if state["ungraded"]:
        return blocked("GRADING_PENDING", f"Còn {state['ungraded']} bài chưa chấm xong")
    return {"can_publish": True, "early": not ended}
