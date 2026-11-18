/** Trạng thái bài nộp phía hệ thống chấm. */
export const SUBMISSION_STATUSES = ['pending_grading', 'grading', 'graded', 'failed'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Trạng thái phiên làm bài. */
export const SESSION_STATUSES = ['in_progress', 'submitted'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Nộp do sinh viên bấm nộp hay do hệ thống tự nộp khi hết giờ. */
export const SUBMIT_REASONS = ['student', 'timeout'] as const;
export type SubmitReason = (typeof SUBMIT_REASONS)[number];

/** Trạng thái hiển thị cho sinh viên ở trang "Kết quả thi" (UC01D). */
export const RESULT_DISPLAY_STATUSES = ['in_progress', 'pending_grading', 'graded', 'published'] as const;
export type ResultDisplayStatus = (typeof RESULT_DISPLAY_STATUSES)[number];
