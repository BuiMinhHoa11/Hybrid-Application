import { queryOne, query, type Queryable } from '@uniexam/db';

export interface LockedSession {
  studentId: string;
  examId: string;
  status: string;
  expired: boolean;
}

/**
 * FOR SHARE: nhiều lần lưu đáp án chạy song song được, nhưng chặn finalizeSession (FOR UPDATE)
 * cho tới khi lưu xong, nên đáp án không lọt vào sau lúc chụp bài nộp.
 */
export function lockSessionShared(sessionId: string, db: Queryable): Promise<LockedSession | null> {
  return queryOne<LockedSession>(
    `SELECT student_id AS "studentId", exam_id AS "examId", status, expires_at <= now() AS expired
     FROM exam_sessions WHERE id = $1 FOR SHARE`,
    [sessionId],
    db
  );
}

export function questionForAnswer(examId: string, questionId: string, db: Queryable) {
  return queryOne<{ type: string; options: Array<{ id: string }> }>(
    `SELECT q.type, q.options FROM exam_paper_questions q JOIN exams e ON e.paper_id = q.paper_id
     WHERE e.id = $1 AND q.id = $2`,
    [examId, questionId],
    db
  );
}

export async function upsertAnswer(
  sessionId: string,
  questionId: string,
  selected: string[] | null,
  flagged: boolean | null,
  db: Queryable
): Promise<{ selectedOptionIds: string[]; flagged: boolean; updatedAt: Date }> {
  const rows = await query<{ selectedOptionIds: string[]; flagged: boolean; updatedAt: Date }>(
    `INSERT INTO answers (session_id, question_id, selected_option_ids, flagged)
     VALUES ($1, $2, COALESCE($3::text[], '{}'), COALESCE($4::boolean, false))
     ON CONFLICT (session_id, question_id) DO UPDATE
       SET selected_option_ids = COALESCE($3::text[], answers.selected_option_ids),
           flagged = COALESCE($4::boolean, answers.flagged),
           updated_at = now()
     RETURNING selected_option_ids AS "selectedOptionIds", flagged, updated_at AS "updatedAt"`,
    [sessionId, questionId, selected, flagged],
    db
  );
  return rows[0];
}
