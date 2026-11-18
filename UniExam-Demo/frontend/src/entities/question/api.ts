import type { Difficulty } from '@uniexam/contracts';
import { publicApi } from '../../shared/api';
import type { Page } from '../user/types';
import type { Question, QuestionFilters, QuestionInput } from './types';

export interface QuestionListParams {
  q?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  difficulty?: Difficulty | '';
  page?: number;
  pageSize?: number;
}

export const questionApi = {
  list: (params: QuestionListParams) => publicApi.get<Page<Question>>('/teacher/questions', { ...params }),
  filters: () => publicApi.get<QuestionFilters>('/teacher/questions/filters'),
  create: (input: QuestionInput) => publicApi.post<Question>('/teacher/questions', input),
  update: (id: string, input: QuestionInput) => publicApi.put<Question>(`/teacher/questions/${id}`, input),
  remove: (id: string) => publicApi.delete<{ deleted: true }>(`/teacher/questions/${id}`)
};
