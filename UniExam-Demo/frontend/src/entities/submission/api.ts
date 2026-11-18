import { examApi, publicApi } from '../../shared/api';
import type { ExamResults, ExamSummary, SessionInfo, SessionPayload, StudentResultItem, SubmissionReview, SubmitResult } from './types';

/** private-api: phiên làm bài của sinh viên. */
export const sessionApi = {
  start: (examId: string) => examApi.post<{ session: SessionInfo; serverTime: string; resumed: boolean }>('/exam-sessions', { examId }),
  get: (sessionId: string) => examApi.get<SessionPayload>(`/exam-sessions/${sessionId}`),
  saveAnswer: (sessionId: string, questionId: string, patch: { selectedOptionIds?: string[]; flagged?: boolean }) =>
    examApi.put<unknown>(`/exam-sessions/${sessionId}/answers/${questionId}`, patch),
  submit: (sessionId: string) => examApi.post<SubmitResult>(`/exam-sessions/${sessionId}/submit`)
};

/** public-api: kết quả của sinh viên (UC01D). */
export const studentResultApi = {
  list: () => publicApi.get<{ items: StudentResultItem[] }>('/student/results'),
  detail: (examId: string) =>
    publicApi.get<{ item: StudentResultItem; review: SubmissionReview | null }>(`/student/results/${examId}`)
};

/** public-api: kết quả kỳ thi cho giáo viên (UC02D). */
export const examResultApi = {
  exams: () => publicApi.get<{ items: ExamSummary[] }>('/teacher/exam-results'),
  results: (examId: string) => publicApi.get<ExamResults>(`/teacher/exam-results/${examId}`),
  submission: (examId: string, submissionId: string) =>
    publicApi.get<SubmissionReview>(`/teacher/exam-results/${examId}/submissions/${submissionId}`),
  publish: (examId: string) => publicApi.post<{ published: true; publishedAt: string }>(`/teacher/exam-results/${examId}/publish`, { confirm: true })
};
