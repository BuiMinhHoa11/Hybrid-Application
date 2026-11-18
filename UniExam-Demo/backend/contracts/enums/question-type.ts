/** Thêm loại mới cần thêm grader tương ứng trong grading-worker. */
export const QUESTION_TYPES = ['multiple_choice', 'fill_blank'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const MAX_TEXT_ANSWER_LENGTH = 500;
export const MAX_ACCEPTED_ANSWERS = 8;

/** Giữ dấu tiếng Việt, bỏ khác biệt chữ hoa/thường và khoảng trắng thừa. */
export function normalizeTextAnswer(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
