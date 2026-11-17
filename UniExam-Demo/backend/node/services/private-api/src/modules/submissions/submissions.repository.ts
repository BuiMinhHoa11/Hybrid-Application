import { query, queryOne, type ExamSessionRow, type Queryable, type SubmittedAnswer, EXAM_SESSION_COLUMNS } from '@uniexam/db';

export function lockSession(sessionId: string, db: Queryable): Promise<ExamSessionRow | null> {
  return queryOne<ExamSessionRow>(`SELECT ${EXAM_SESSION_COLUMNS} FROM exam_sessions WHERE id = $1 FOR UPDATE`, [sessionId], db);
}

export function answersOf(sessionId: string, db: Queryable): Promise<SubmittedAnswer[]> {
  return query<SubmittedAnswer>(
    `SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds" FROM answers WHERE session_id = $1`,
    [sessionId],
    db
  );
}

export async function paperQuestionCount(examId: string, db: Queryable): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM exam_paper_questions q JOIN exams e ON e.paper_id = q.paper_id WHERE e.id = $1`,
    [examId],
    db
  );
  return row?.n ?? 0;
}

export async function markSubmitted(sessionId: string, reason: 'student' | 'timeout', db: Queryable): Promise<void> {
  await query(
    `UPDATE exam_sessions SET status = 'submitted', submitted_at = now(), submit_reason = $2 WHERE id = $1`,
    [sessionId, reason],
    db
  );
}

export async function insertSubmission(
  s: ExamSessionRow,
  snapshot: SubmittedAnswer[],
  db: Queryable
): Promise<{ id: string; submittedAt: Date }> {
  const row = await queryOne<{ id: string; submittedAt: Date }>(
    `INSERT INTO submissions (session_id, exam_id, student_id, answers_snapshot)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
     RETURNING id, submitted_at AS "submittedAt"`,
    [s.id, s.examId, s.studentId, JSON.stringify(snapshot)],
    db
  );
  return row!;
}

export function findSubmissionBySession(sessionId: string, db: Queryable) {
  return queryOne<{ id: string; status: string; answersSnapshot: SubmittedAnswer[] }>(
    `SELECT id, status, answers_snapshot AS "answersSnapshot" FROM submissions WHERE session_id = $1`,
    [sessionId],
    db
  );
}
