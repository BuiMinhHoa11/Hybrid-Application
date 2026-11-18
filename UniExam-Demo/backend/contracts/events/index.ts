import type { SubmitReason } from '../enums/submission-status';

/** Phát ra khi bài nộp được chốt và chuyển sang "chờ chấm" (UC01C). */
export interface SubmissionCreatedEvent {
  type: 'submission.created';
  submissionId: string;
  sessionId: string;
  examId: string;
  studentId: string;
  reason: SubmitReason;
  submittedAt: string;
}

/** Phát ra khi grading-worker ghi điểm xong (UC04A). */
export interface SubmissionGradedEvent {
  type: 'submission.graded';
  submissionId: string;
  examId: string;
  studentId: string;
  score: number;
  maxScore: number;
  gradedAt: string;
}

export type DomainEvent = SubmissionCreatedEvent | SubmissionGradedEvent;
