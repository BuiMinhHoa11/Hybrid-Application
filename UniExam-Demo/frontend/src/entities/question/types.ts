import type { Difficulty, QuestionType } from '@uniexam/contracts';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  points: number;
}

export type QuestionInput = Omit<Question, 'id'>;

export interface QuestionFilters {
  subjects: string[];
  chapters: string[];
  topics: string[];
}
