import type { SessionStatus, SubmitReason } from '@uniexam/contracts';

export interface ExamSessionRow {
  id: string;
  examId: string;
  studentId: string;
  status: SessionStatus;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  submitReason: SubmitReason | null;
}

export const EXAM_SESSION_COLUMNS = `
  id, exam_id AS "examId", student_id AS "studentId", status, started_at AS "startedAt",
  expires_at AS "expiresAt", submitted_at AS "submittedAt", submit_reason AS "submitReason"`;
