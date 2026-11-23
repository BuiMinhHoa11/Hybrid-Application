import type { ResultDisplayStatus, SubmissionStatus, ResultsPublication } from '@uniexam/contracts';

export interface SessionInfo {
  id: string;
  examId: string;
  status: 'in_progress' | 'submitted';
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  /** offline: bài làm khi mất mạng, máy tự gửi lên sau khi có mạng lại. */
  submitReason: 'student' | 'timeout' | 'offline' | null;
}

export interface SessionQuestion {
  id: string;
  type: string;
  position: number;
  content: string;
  imageDataUrl?: string | null;
  options: Array<{ id: string; text: string }>;
  points: number;
  allowMultiple: boolean;
}

export interface SavedAnswer {
  /** Với fill_blank: [] khi bỏ trống, hoặc [câu trả lời]. */
  selectedOptionIds: string[];
  flagged: boolean;
}

export interface SessionPayload {
  serverTime: string;
  session: SessionInfo;
  exam: { id: string; title: string; subject: string; durationMinutes: number };
  questions: SessionQuestion[];
  answers: Record<string, SavedAnswer>;
}

/** Bài làm giữ trên máy khi mất mạng, gửi lên một lần khi có mạng lại. */
export interface OfflineSubmission {
  answers: Array<{ questionId: string; selectedOptionIds: string[]; flagged: boolean }>;
  /** Giờ trên máy (đã bù lệch với server) lúc khóa bài; chỉ để giáo viên tham khảo. */
  sealedAt: string;
  offlineSeconds: number;
}

export interface SubmitResult {
  submissionId: string;
  alreadySubmitted: boolean;
  total: number;
  answered: number;
  unanswered: number;
  status: 'pending_grading';
}

export interface StudentResultItem {
  examId: string;
  title: string;
  subject: string;
  startedAt: string;
  submittedAt: string | null;
  status: ResultDisplayStatus;
  score: number | null;
  maxScore: number | null;
}

export interface ReviewedQuestion {
  id: string;
  type: string;
  position: number;
  content: string;
  imageDataUrl?: string | null;
  options: Array<{ id: string; text: string }>;
  points: number;
  selectedOptionIds: string[];
  correctOptionIds?: string[];
  correct?: boolean | null;
  earned?: number | null;
}

export interface SubmissionReview {
  submission: { id: string; status: SubmissionStatus; submittedAt: string; submitReason: string | null };
  result: { score: number; maxScore: number } | null;
  questions: ReviewedQuestion[];
}

export interface ExamSummary {
  id: string;
  title: string;
  subject: string;
  status: string;
  startTime: string;
  endTime: string;
  resultsPublished: boolean;
  audienceCount: number;
  submittedCount: number;
  gradedCount: number;
}

export interface ResultRow {
  sessionId: string | null;
  fullscreenExitCount: number;
  studentId: string;
  username: string;
  fullName: string;
  sessionStatus: string | null;
  submissionId: string | null;
  submissionStatus: SubmissionStatus | null;
  submittedAt: string | null;
  submitReason: 'student' | 'timeout' | 'offline' | null;
  /** Chỉ có với bài nộp ngoại tuyến: lúc server nhận, thời gian mất mạng (máy báo), số giây gửi trễ sau giờ hết hạn. */
  offlineSyncedAt?: string | null;
  offlineSeconds?: number | null;
  offlineLateSeconds?: number | null;
  score: number | null;
  maxScore: number | null;
}

export interface FullscreenEvent {
  id: string;
  type: 'fullscreen_enter' | 'fullscreen_exit';
  clientTime: string;
}

export interface SessionEvents {
  items: Array<FullscreenEvent & { receivedAt: string }>;
  total: number;
  fullscreenExitCount: number;
}

export interface ExamResults {
  exam: { id: string; title: string; subject: string; status: string; resultsPublished: boolean; resultsPublishedAt: string | null };
  rows: ResultRow[];
  publication: ResultsPublication;
  stats: {
    audience: number;
    started: number;
    submitted: number;
    graded: number;
    averageScore: number | null;
    medianScore: number | null;
    minScore: number | null;
    maxScore: number | null;
  };
}
