import type { SubmissionStatus } from '@uniexam/contracts';

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionIds: string[];
}

export interface SubmissionRow {
  id: string;
  sessionId: string;
  examId: string;
  studentId: string;
  status: SubmissionStatus;
  answersSnapshot: SubmittedAnswer[];
  submittedAt: Date;
  claimedAt: Date | null;
  gradedAt: Date | null;
  attempts: number;
  failReason: string | null;
}

export const SUBMISSION_COLUMNS = `
  id, session_id AS "sessionId", exam_id AS "examId", student_id AS "studentId", status,
  answers_snapshot AS "answersSnapshot", submitted_at AS "submittedAt", claimed_at AS "claimedAt",
  graded_at AS "gradedAt", attempts, fail_reason AS "failReason"`;
