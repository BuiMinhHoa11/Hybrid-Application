import type { Difficulty } from '@uniexam/contracts';
import type { QuestionOption } from './question';

export interface ExamPaperRow {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  description: string;
  createdAt: Date;
}

export const EXAM_PAPER_COLUMNS = `
  id, owner_id AS "ownerId", title, subject, description, created_at AS "createdAt"`;

/** Câu hỏi đã chụp vào đề; sửa ngân hàng câu hỏi không ảnh hưởng. */
export interface PaperQuestionRow {
  id: string;
  paperId: string;
  position: number;
  questionId: string | null;
  type: string;
  content: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  points: number;
  chapter: string;
  topic: string;
  difficulty: Difficulty;
}

export const PAPER_QUESTION_COLUMNS = `
  id, paper_id AS "paperId", position, question_id AS "questionId", type, content, options,
  correct_option_ids AS "correctOptionIds", points, chapter, topic, difficulty`;
