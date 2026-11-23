import type { Difficulty, ExamStatus } from '@uniexam/contracts';
import { publicApi } from '../../shared/api';
import type { Page } from '../user/types';
import type { Question } from '../question/types';
import type { AudienceMember, EmailNotificationSummary, ExamInput, PaperDetail, PaperListItem, StudentExam, TeacherExam, ValidationIssue } from './types';

export const studentExamApi = {
  list: () => publicApi.get<{ serverTime: string; items: StudentExam[] }>('/student/exams'),
  detail: (id: string) => publicApi.get<{ serverTime: string; exam: StudentExam }>(`/student/exams/${id}`)
};

export const teacherExamApi = {
  list: (params: { status?: ExamStatus | ''; q?: string; page?: number; pageSize?: number }) =>
    publicApi.get<Page<TeacherExam>>('/teacher/exams', { ...params }),
  get: (id: string) => publicApi.get<{ exam: TeacherExam; audience: AudienceMember[] }>(`/teacher/exams/${id}`),
  create: (input: ExamInput) => publicApi.post<TeacherExam>('/teacher/exams', input),
  update: (id: string, input: Partial<ExamInput>) => publicApi.put<TeacherExam>(`/teacher/exams/${id}`, input),
  remove: (id: string) => publicApi.delete<{ deleted: true }>(`/teacher/exams/${id}`),
  setAudience: (id: string, usernames: string[]) =>
    publicApi.put<{ audience: AudienceMember[] }>(`/teacher/exams/${id}/audience`, { usernames }),
  validate: (id: string) => publicApi.post<{ valid: boolean; issues: ValidationIssue[] }>(`/teacher/exams/${id}/validate`),
  publish: (id: string) =>
    publicApi.post<TeacherExam & { emailNotifications?: EmailNotificationSummary }>(`/teacher/exams/${id}/publish`)
};

export interface PaperAutoRule {
  chapter?: string;
  topic?: string;
  difficulty?: Difficulty | '';
  count: number;
}

export const paperApi = {
  list: () => publicApi.get<{ items: PaperListItem[] }>('/teacher/papers'),
  get: (id: string) => publicApi.get<PaperDetail>(`/teacher/papers/${id}`),
  create: (input: { title: string; subject: string; description: string; questionIds: string[] }) =>
    publicApi.post<PaperDetail>('/teacher/papers', input),
  autoPreview: (input: { subject: string; rules: PaperAutoRule[] }) =>
    publicApi.post<{ questions: Question[]; totalPoints: number }>('/teacher/papers/auto-preview', input),
  remove: (id: string) => publicApi.delete<{ deleted: true }>(`/teacher/papers/${id}`)
};
