import { query, queryOne, withTransaction, type SubmittedAnswer } from '@uniexam/db';
import type { ResultBody } from './grading-gateway.dto';

/** Số lần chấm tối đa cho một bài trước khi đánh dấu thất bại. */
export const MAX_ATTEMPTS = 5;
/** Bài ở trạng thái "đang chấm" quá lâu (worker chết giữa chừng) sẽ được giao lại. */
export const CLAIM_TIMEOUT = '5 minutes';

export interface ClaimedRow {
  id: string;
  examId: string;
  studentId: string;
  attempts: number;
  answers: SubmittedAnswer[];
}

/** Bài quá số lần thử mà vẫn kẹt ở "đang chấm" thì đánh dấu thất bại để không kẹt mãi. */
export async function failStuck(): Promise<void> {
  await query(
    `UPDATE submissions SET status = 'failed', fail_reason = COALESCE(fail_reason, 'Quá số lần chấm cho phép')
     WHERE status = 'grading' AND claimed_at < now() - interval '${CLAIM_TIMEOUT}' AND attempts >= $1`,
    [MAX_ATTEMPTS]
  );
}

/**
 * Giao một bài chờ chấm cho worker. FOR UPDATE SKIP LOCKED giúp nhiều worker chạy song song
 * không nhận trùng một bài.
 */
export function claimNext(): Promise<ClaimedRow | null> {
  return queryOne<ClaimedRow>(
    `UPDATE submissions SET status = 'grading', claimed_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM submissions
       WHERE (status = 'pending_grading' OR (status = 'grading' AND claimed_at < now() - interval '${CLAIM_TIMEOUT}'))
         AND attempts < $1
       ORDER BY submitted_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, exam_id AS "examId", student_id AS "studentId", attempts, answers_snapshot AS answers`,
    [MAX_ATTEMPTS]
  );
}

export function questionsOfExam(examId: string) {
  return query<{ id: string; type: string; points: number; correctOptionIds: string[] }>(
    `SELECT q.id, q.type, q.points, q.correct_option_ids AS "correctOptionIds"
     FROM exam_paper_questions q JOIN exams e ON e.paper_id = q.paper_id
     WHERE e.id = $1 ORDER BY q.position`,
    [examId]
  );
}

export type SaveOutcome =
  | { ok: true; examId: string; studentId: string; gradedAt: Date }
  | { ok: false; reason: 'not_found' | 'bad_state' };

/** Ghi điểm và chuyển bài sang "đã chấm" trong một transaction. */
export function saveResult(submissionId: string, body: ResultBody): Promise<SaveOutcome> {
  return withTransaction(async (tx): Promise<SaveOutcome> => {
    const sub = await queryOne<{ status: string; examId: string; studentId: string }>(
      `SELECT status, exam_id AS "examId", student_id AS "studentId" FROM submissions WHERE id = $1 FOR UPDATE`,
      [submissionId],
      tx
    );
    if (!sub) return { ok: false, reason: 'not_found' };
    if (sub.status !== 'grading') return { ok: false, reason: 'bad_state' };

    await query(
      `INSERT INTO grading_results (submission_id, score, max_score, details, graded_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (submission_id) DO UPDATE
         SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, details = EXCLUDED.details, graded_by = EXCLUDED.graded_by`,
      [submissionId, body.score, body.maxScore, JSON.stringify(body.details), body.workerId],
      tx
    );
    const updated = await queryOne<{ gradedAt: Date }>(
      `UPDATE submissions SET status = 'graded', graded_at = now(), fail_reason = NULL WHERE id = $1 RETURNING graded_at AS "gradedAt"`,
      [submissionId],
      tx
    );
    return { ok: true, examId: sub.examId, studentId: sub.studentId, gradedAt: updated!.gradedAt };
  });
}

/** Worker báo lỗi: còn lượt thì trả về hàng đợi, hết lượt thì thất bại hẳn. */
export async function releaseOrFail(submissionId: string, reason: string): Promise<'not_found' | 'requeued' | 'failed'> {
  const row = await queryOne<{ status: string }>(
    `UPDATE submissions
       SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'pending_grading' END, fail_reason = $3
     WHERE id = $1 AND status = 'grading' RETURNING status`,
    [submissionId, MAX_ATTEMPTS, reason]
  );
  if (!row) return 'not_found';
  return row.status === 'failed' ? 'failed' : 'requeued';
}
