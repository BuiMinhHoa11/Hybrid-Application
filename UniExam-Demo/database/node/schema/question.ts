import type { Difficulty, QuestionType } from '@uniexam/contracts';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionRow {
  id: string;
  ownerId: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  /** Mã lựa chọn cho trắc nghiệm; các đáp án văn bản được chấp nhận cho fill_blank. */
  correctOptionIds: string[];
  points: number;
  createdAt: Date;
  updatedAt: Date;
}

export const QUESTION_COLUMNS = `
  id, owner_id AS "ownerId", subject, chapter, topic, difficulty, type, content, options,
  correct_option_ids AS "correctOptionIds", points, created_at AS "createdAt", updated_at AS "updatedAt"`;
