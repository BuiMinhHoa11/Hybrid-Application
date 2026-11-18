import { query } from '@uniexam/db';
import { errorMeta } from '@uniexam/observability';
import { logger } from '../logger';
import { finalizeSession } from '../modules/submissions/submissions.service';

export interface LifecycleTickResult {
  opened: number;
  locked: number;
  autoSubmitted: number;
  closed: number;
}

/**
 * Một lượt xử lý vòng đời kỳ thi (UC02C, UC01C). Mọi bước idempotent nên chạy trùng hoặc
 * nhiều bản private-api cùng chạy đều an toàn.
 *   1. published -> open     : đến giờ bắt đầu
 *   2. *         -> locked   : hết giờ, không cho bắt đầu bài mới
 *   3. tự nộp các phiên đã hết giờ mà chưa nộp
 *   4. locked    -> closed   : không còn phiên làm dở
 */
export async function runLifecycleTick(): Promise<LifecycleTickResult> {
  const opened = await query(
    `UPDATE exams SET status = 'open', updated_at = now()
     WHERE status = 'published' AND start_time <= now() AND end_time > now() RETURNING id`
  );

  const locked = await query(
    `UPDATE exams SET status = 'locked', updated_at = now()
     WHERE status IN ('published', 'open') AND end_time <= now() RETURNING id`
  );

  let autoSubmitted = 0;
  const expired = await query<{ id: string }>(
    `SELECT id FROM exam_sessions WHERE status = 'in_progress' AND expires_at <= now() ORDER BY expires_at LIMIT 500`
  );
  for (const { id } of expired) {
    try {
      const result = await finalizeSession(id, 'timeout');
      if (result && !result.alreadySubmitted) autoSubmitted += 1;
    } catch (err) {
      logger.error('Tự nộp bài thất bại', { sessionId: id, ...errorMeta(err) });
    }
  }

  const closed = await query(
    `UPDATE exams e SET status = 'closed', updated_at = now()
     WHERE e.status = 'locked'
       AND NOT EXISTS (SELECT 1 FROM exam_sessions s WHERE s.exam_id = e.id AND s.status = 'in_progress')
     RETURNING e.id`
  );

  return { opened: opened.length, locked: locked.length, autoSubmitted, closed: closed.length };
}

/** Chạy runLifecycleTick định kỳ, không chồng lượt nếu một lượt kéo dài. */
export function startLifecycleJob(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runLifecycleTick();
      if (r.opened || r.locked || r.autoSubmitted || r.closed) logger.info('Vòng đời kỳ thi', { ...r });
    } catch (err) {
      logger.error('Job vòng đời kỳ thi lỗi', errorMeta(err));
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
