import { query } from '@uniexam/db';

export interface StudentResultRow {
  examId: string;
  title: string;
  subject: string;
  resultsPublished: boolean;
  startedAt: Date;
  sessionStatus: 'in_progress' | 'submitted';
  submittedAt: Date | null;
  submissionStatus: string | null;
  score: number | null;
  maxScore: number | null;
}

export function listForStudent(studentId: string): Promise<StudentResultRow[]> {
  return query<StudentResultRow>(
    `SELECT e.id AS "examId", e.title, e.subject, e.results_published AS "resultsPublished",
            ss.started_at AS "startedAt", ss.status AS "sessionStatus", ss.submitted_at AS "submittedAt",
            sub.status AS "submissionStatus", gr.score, gr.max_score AS "maxScore"
     FROM exam_sessions ss
     JOIN exams e ON e.id = ss.exam_id
     LEFT JOIN submissions sub ON sub.session_id = ss.id
     LEFT JOIN grading_results gr ON gr.submission_id = sub.id
     WHERE ss.student_id = $1
     ORDER BY ss.started_at DESC`,
    [studentId]
  );
}
