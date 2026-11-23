import { examApi, publicApi } from '../../shared/api';
import type { ExamResults, ExamSummary, OfflineSubmission, SessionInfo, SessionPayload, StudentResultItem, SubmissionReview, SubmitResult } from './types';
import type { FullscreenEvent, SessionEvents } from './types';

/** private-api: phiên làm bài của sinh viên. */
export const sessionApi = {
  event: (sessionId: string, event: FullscreenEvent) =>
    examApi.post<unknown>(`/exam-sessions/${sessionId}/events`, event, { keepalive: true, signal: AbortSignal.timeout(8000) }),
  start: (examId: string) => examApi.post<{ session: SessionInfo; serverTime: string; resumed: boolean }>('/exam-sessions', { examId }),
  get: (sessionId: string) => examApi.get<SessionPayload>(`/exam-sessions/${sessionId}`),
  saveAnswer: (sessionId: string, questionId: string, patch: { selectedOptionIds?: string[]; flagged?: boolean }) =>
    examApi.put<unknown>(`/exam-sessions/${sessionId}/answers/${questionId}`, patch),
  submit: (sessionId: string) => examApi.post<SubmitResult>(`/exam-sessions/${sessionId}/submit`),
  offlineSubmit: (sessionId: string, body: OfflineSubmission) =>
    // 202 { buffered: true }: hệ thống chính (OpenStack) đang sập, gateway đã giữ tạm bài trên S3.
    examApi.post<{ session?: SessionInfo; alreadySubmitted?: boolean; buffered?: boolean }>(`/exam-sessions/${sessionId}/offline-submit`, body,
      { signal: AbortSignal.timeout(60_000) })
};

/** public-api: kết quả của sinh viên (UC01D). */
export const studentResultApi = {
  list: () => publicApi.get<{ items: StudentResultItem[] }>('/student/results'),
  detail: (examId: string) =>
    publicApi.get<{ item: StudentResultItem; review: SubmissionReview | null }>(`/student/results/${examId}`)
};

/** public-api: kết quả kỳ thi cho giáo viên (UC02D). */
export const examResultApi = {
  events: (examId: string, sessionId: string) => publicApi.get<SessionEvents>(`/teacher/exam-results/${examId}/sessions/${sessionId}/events`),
  exams: () => publicApi.get<{ items: ExamSummary[] }>('/teacher/exam-results'),
  results: (examId: string) => publicApi.get<ExamResults>(`/teacher/exam-results/${examId}`),
  submission: (examId: string, submissionId: string) =>
    publicApi.get<SubmissionReview>(`/teacher/exam-results/${examId}/submissions/${submissionId}`),
  publish: (examId: string) => publicApi.post<{ published: true; publishedAt: string }>(`/teacher/exam-results/${examId}/publish`, { confirm: true })
};
