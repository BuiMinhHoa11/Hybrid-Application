import { query, queryOne } from '@uniexam/db';
import type { ExamStatus } from '@uniexam/contracts';

export interface StudentExamRow {
  id: string;
  title: string;
  subject: string;
  description: string;
  format: string;
  publishAt: Date | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  questionCount: number;
  status: ExamStatus;
  sessionId: string | null;
  sessionStatus: 'in_progress' | 'submitted' | null;
}

const SELECT = `
  SELECT e.id, e.title, e.subject, e.description, e.format, e.publish_at AS "publishAt", e.start_time AS "startTime", e.end_time AS "endTime",
         e.duration_minutes AS "durationMinutes", e.question_count AS "questionCount",
         e.status,
         s.id AS "sessionId", s.status AS "sessionStatus"
  FROM exams e
  JOIN exam_audience a ON a.exam_id = e.id AND a.student_id = $1
  LEFT JOIN exam_sessions s ON s.exam_id = e.id AND s.student_id = $1
  WHERE e.status <> 'draft' AND (e.publish_at IS NULL OR e.publish_at <= now())`;

export function listForStudent(studentId: string): Promise<StudentExamRow[]> {
  return query<StudentExamRow>(`${SELECT} ORDER BY e.start_time DESC`, [studentId]);
}

export function findForStudent(studentId: string, examId: string): Promise<StudentExamRow | null> {
  return queryOne<StudentExamRow>(`${SELECT} AND e.id = $2`, [studentId, examId]);
}
