import { query, queryOne, type GradingDetail, type PaperQuestionRow, type SubmittedAnswer } from '@uniexam/db';
import type { ResultsPublicationState } from '@uniexam/contracts';

export interface ExamForResults {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  status: string;
  paperId: string | null;
  resultsPublished: boolean;
  resultsPublishedAt: Date | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  questionCount: number;
}

export function findExam(examId: string): Promise<ExamForResults | null> {
  return queryOne<ExamForResults>(
    `SELECT id, owner_id AS "ownerId", title, subject, status, paper_id AS "paperId",
            results_published AS "resultsPublished", results_published_at AS "resultsPublishedAt",
            start_time AS "startTime", end_time AS "endTime", duration_minutes AS "durationMinutes",
            question_count AS "questionCount"
     FROM exams WHERE id = $1`,
    [examId]
  );
}

export interface ExamSummaryRow {
  id: string;
  title: string;
  subject: string;
  status: string;
  startTime: Date;
  endTime: Date;
  resultsPublished: boolean;
  audienceCount: number;
  submittedCount: number;
  gradedCount: number;
}

/** Danh sách kỳ thi của giáo viên kèm số liệu bài nộp, dùng để chọn kỳ thi ở trang "Kết quả kỳ thi". */
export function listExamSummaries(ownerId?: string): Promise<ExamSummaryRow[]> {
  return query<ExamSummaryRow>(
    `SELECT e.id, e.title, e.subject, e.status, e.start_time AS "startTime", e.end_time AS "endTime",
            e.results_published AS "resultsPublished",
            (SELECT count(*) FROM exam_audience a WHERE a.exam_id = e.id) AS "audienceCount",
            (SELECT count(*) FROM submissions s WHERE s.exam_id = e.id) AS "submittedCount",
            (SELECT count(*) FROM submissions s WHERE s.exam_id = e.id AND s.status = 'graded') AS "gradedCount"
     FROM exams e
     WHERE e.status <> 'draft' AND ($1::uuid IS NULL OR e.owner_id = $1)
     ORDER BY e.start_time DESC`,
    [ownerId ?? null]
  );
}

export interface ResultRow {
  studentId: string;
  username: string;
  fullName: string;
  sessionStatus: string | null;
  startedAt: Date | null;
  submissionId: string | null;
  submissionStatus: string | null;
  submittedAt: Date | null;
  submitReason: string | null;
  score: number | null;
  maxScore: number | null;
}

/** Mọi sinh viên thuộc đối tượng dự thi, kể cả người chưa làm bài. */
export function listResultRows(examId: string): Promise<ResultRow[]> {
  return query<ResultRow>(
    `SELECT u.id AS "studentId", u.username, u.full_name AS "fullName",
            ss.status AS "sessionStatus", ss.started_at AS "startedAt",
            sub.id AS "submissionId", sub.status AS "submissionStatus", sub.submitted_at AS "submittedAt",
            ss.submit_reason AS "submitReason", gr.score, gr.max_score AS "maxScore"
     FROM exam_audience a
     JOIN users u ON u.id = a.student_id
     LEFT JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id
     LEFT JOIN submissions sub ON sub.session_id = ss.id
     LEFT JOIN grading_results gr ON gr.submission_id = sub.id
     WHERE a.exam_id = $1
     ORDER BY u.username`,
    [examId]
  );
}

export async function publicationState(examId: string): Promise<ResultsPublicationState> {
  const row = await queryOne<ResultsPublicationState>(
    `SELECT
       (SELECT count(*)::int FROM exam_audience WHERE exam_id = $1) AS audience,
       (SELECT count(*)::int FROM exam_audience a
        JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id AND ss.status = 'submitted'
        JOIN submissions sub ON sub.session_id = ss.id WHERE a.exam_id = $1) AS submitted,
       (SELECT count(*)::int FROM exam_sessions WHERE exam_id = $1 AND status = 'in_progress') AS "openSessions",
       (SELECT count(*)::int FROM submissions sub LEFT JOIN grading_results gr ON gr.submission_id = sub.id
        WHERE sub.exam_id = $1 AND (sub.status <> 'graded' OR gr.id IS NULL)) AS ungraded`,
    [examId]
  );
  return row!;
}

export async function markResultsPublished(examId: string): Promise<boolean> {
  const rows = await query(
    `UPDATE exams e SET results_published = true, results_published_at = now(), updated_at = now(), status = 'closed'
     WHERE e.id = $1 AND e.results_published = false AND e.status IN ('published', 'open', 'locked', 'closed')
       AND NOT EXISTS (SELECT 1 FROM exam_sessions ss WHERE ss.exam_id = e.id AND ss.status = 'in_progress')
       AND NOT EXISTS (SELECT 1 FROM submissions sub LEFT JOIN grading_results gr ON gr.submission_id = sub.id
                       WHERE sub.exam_id = e.id AND (sub.status <> 'graded' OR gr.id IS NULL))
       AND (e.status = 'closed' OR (
         EXISTS (SELECT 1 FROM exam_audience a WHERE a.exam_id = e.id)
         AND NOT EXISTS (
           SELECT 1 FROM exam_audience a
           LEFT JOIN exam_sessions ss ON ss.exam_id = a.exam_id AND ss.student_id = a.student_id
           LEFT JOIN submissions sub ON sub.session_id = ss.id
           WHERE a.exam_id = e.id AND (ss.status IS DISTINCT FROM 'submitted' OR sub.id IS NULL)
         )
       )) RETURNING e.id`,
    [examId]
  );
  return rows.length > 0;
}

export interface SubmissionHeader {
  id: string;
  studentId: string;
  status: string;
  submittedAt: Date;
  submitReason: string | null;
  answersSnapshot: SubmittedAnswer[];
  score: number | null;
  maxScore: number | null;
  details: GradingDetail[] | null;
}

const HEADER_SELECT = `
  SELECT sub.id, sub.student_id AS "studentId", sub.status, sub.submitted_at AS "submittedAt",
         ss.submit_reason AS "submitReason", sub.answers_snapshot AS "answersSnapshot",
         gr.score, gr.max_score AS "maxScore", gr.details
  FROM submissions sub
  JOIN exam_sessions ss ON ss.id = sub.session_id
  LEFT JOIN grading_results gr ON gr.submission_id = sub.id`;

export function findSubmissionById(examId: string, submissionId: string): Promise<SubmissionHeader | null> {
  return queryOne<SubmissionHeader>(`${HEADER_SELECT} WHERE sub.exam_id = $1 AND sub.id = $2`, [examId, submissionId]);
}

export function findSubmissionByStudent(examId: string, studentId: string): Promise<SubmissionHeader | null> {
  return queryOne<SubmissionHeader>(`${HEADER_SELECT} WHERE sub.exam_id = $1 AND sub.student_id = $2`, [examId, studentId]);
}

export function listPaperQuestions(paperId: string): Promise<PaperQuestionRow[]> {
  return query<PaperQuestionRow>(
    `SELECT id, paper_id AS "paperId", position, question_id AS "questionId", type, content, options,
            correct_option_ids AS "correctOptionIds", points, chapter, topic, difficulty
     FROM exam_paper_questions WHERE paper_id = $1 ORDER BY position`,
    [paperId]
  );
}
