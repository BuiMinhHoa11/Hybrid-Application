import type { ExamStatus } from '@uniexam/contracts';
import { EXAM_SESSION_COLUMNS, query, queryOne, type ExamSessionRow } from '@uniexam/db';
import type { SessionQuestionDto } from './exam-sessions.dto';

export interface ExamForSession {
  id: string;
  title: string;
  subject: string;
  status: ExamStatus;
  paperId: string | null;
  publishAt: Date | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
}

export function findExam(examId: string): Promise<ExamForSession | null> {
  return queryOne<ExamForSession>(
    `SELECT id, title, subject, status, paper_id AS "paperId", publish_at AS "publishAt", start_time AS "startTime", end_time AS "endTime",
            duration_minutes AS "durationMinutes"
     FROM exams WHERE id = $1`,
    [examId]
  );
}

export async function isInAudience(examId: string, studentId: string): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM exam_audience WHERE exam_id = $1 AND student_id = $2', [examId, studentId])) !== null;
}

export function findByExamAndStudent(examId: string, studentId: string): Promise<ExamSessionRow | null> {
  return queryOne<ExamSessionRow>(
    `SELECT ${EXAM_SESSION_COLUMNS} FROM exam_sessions WHERE exam_id = $1 AND student_id = $2`,
    [examId, studentId]
  );
}

export function findById(id: string): Promise<ExamSessionRow | null> {
  return queryOne<ExamSessionRow>(`SELECT ${EXAM_SESSION_COLUMNS} FROM exam_sessions WHERE id = $1`, [id]);
}

/** Tạo phiên; hai request đồng thời của cùng sinh viên chỉ tạo được một phiên (UNIQUE exam_id, student_id). */
export async function createSession(examId: string, studentId: string, expiresAt: Date): Promise<ExamSessionRow> {
  await query(
    `INSERT INTO exam_sessions (exam_id, student_id, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (exam_id, student_id) DO NOTHING`,
    [examId, studentId, expiresAt]
  );
  return (await findByExamAndStudent(examId, studentId))!;
}

/**
 * Chỉ chọn các cột an toàn: KHÔNG có correct_option_ids.
 * allowMultiple cho giao diện biết dùng ô chọn nhiều hay một, mà không lộ đáp án nào đúng.
 */
export function listQuestionsForStudent(paperId: string): Promise<SessionQuestionDto[]> {
  return query<SessionQuestionDto>(
    `SELECT id, type, position, content, options, points,
            type = 'multiple_choice' AND cardinality(correct_option_ids) > 1 AS "allowMultiple"
     FROM exam_paper_questions WHERE paper_id = $1 ORDER BY position`,
    [paperId]
  );
}

export function listAnswers(sessionId: string) {
  return query<{ questionId: string; selectedOptionIds: string[]; flagged: boolean }>(
    `SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds", flagged FROM answers WHERE session_id = $1`,
    [sessionId]
  );
}
