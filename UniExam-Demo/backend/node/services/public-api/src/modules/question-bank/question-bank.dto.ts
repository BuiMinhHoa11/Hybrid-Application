import { z } from 'zod';
import { DIFFICULTIES, QUESTION_TYPES, MAX_ACCEPTED_ANSWERS, MAX_TEXT_ANSWER_LENGTH, normalizeTextAnswer } from '@uniexam/contracts';
import { optionalText, pagination } from '../common';

const optionSchema = z.object({
  id: z.string().trim().min(1, 'Lựa chọn thiếu mã').max(10),
  text: z.string().trim().min(1, 'Nội dung lựa chọn không được để trống').max(1000)
});

/** UC02A: có nội dung, có đáp án đúng, điểm lớn hơn 0. */
export const questionBody = z
  .object({
    subject: z.string().trim().min(1, 'Nhập môn học').max(200),
    chapter: z.string().trim().max(200).default(''),
    topic: z.string().trim().max(200).default(''),
    difficulty: z.enum(DIFFICULTIES, { errorMap: () => ({ message: 'Độ khó không hợp lệ' }) }),
    type: z.enum(QUESTION_TYPES).default('multiple_choice'),
    content: z.string().trim().min(1, 'Nhập nội dung câu hỏi').max(5000),
    options: z.array(optionSchema).max(8, 'Tối đa 8 lựa chọn').default([]),
    correctOptionIds: z.array(z.string().trim().min(1, 'Đáp án không được để trống').max(MAX_TEXT_ANSWER_LENGTH))
      .min(1, 'Chọn ít nhất một đáp án đúng').max(MAX_ACCEPTED_ANSWERS),
    points: z.coerce.number().gt(0, 'Điểm phải lớn hơn 0').max(100)
  })
  .superRefine((q, ctx) => {
    if (q.type === 'fill_blank') {
      if (q.options.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Câu điền vào chỗ trống không có lựa chọn' });
      }
      if (new Set(q.correctOptionIds.map(normalizeTextAnswer)).size !== q.correctOptionIds.length) {
        ctx.addIssue({ code: 'custom', path: ['correctOptionIds'], message: 'Đáp án được chấp nhận bị lặp' });
      }
      return;
    }
    if (q.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Cần ít nhất 2 lựa chọn' });
    }
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Mã các lựa chọn bị trùng nhau' });
    }
    const unknown = q.correctOptionIds.filter((id) => !ids.includes(id));
    if (unknown.length) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIds'], message: 'Đáp án đúng không nằm trong các lựa chọn' });
    }
    if (new Set(q.correctOptionIds).size !== q.correctOptionIds.length) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIds'], message: 'Đáp án đúng bị lặp' });
    }
  });
export type QuestionBody = z.infer<typeof questionBody>;

export const listQuery = z.object({
  q: optionalText,
  subject: optionalText,
  chapter: optionalText,
  topic: optionalText,
  difficulty: z.preprocess((v) => (v === '' ? undefined : v), z.enum(DIFFICULTIES).optional()),
  type: z.preprocess((v) => (v === '' ? undefined : v), z.enum(QUESTION_TYPES).optional()),
  ...pagination
});
export type ListQuery = z.infer<typeof listQuery>;
