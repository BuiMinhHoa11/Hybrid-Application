import { z } from 'zod';
import { DIFFICULTIES } from '@uniexam/contracts';
import { optionalText } from '../common';

export const paperBody = z
  .object({
    title: z.string().trim().min(1, 'Nhập tên đề thi').max(200),
    subject: z.string().trim().min(1, 'Nhập môn học').max(200),
    description: z.string().trim().max(2000).default(''),
    questionIds: z.array(z.string().uuid()).min(1, 'Đề thi cần ít nhất một câu hỏi').max(300),
    /** Nếu gửi, hệ thống kiểm tra đề có đúng số câu này. */
    expectedCount: z.number().int().positive().optional()
  })
  .superRefine((b, ctx) => {
    if (new Set(b.questionIds).size !== b.questionIds.length) {
      ctx.addIssue({ code: 'custom', path: ['questionIds'], message: 'Có câu hỏi bị chọn trùng' });
    }
  });
export type PaperBody = z.infer<typeof paperBody>;

export const autoBody = z.object({
  subject: z.string().trim().min(1, 'Nhập môn học').max(200),
  rules: z
    .array(
      z.object({
        chapter: optionalText,
        topic: optionalText,
        difficulty: z.preprocess((v) => (v === '' ? undefined : v), z.enum(DIFFICULTIES).optional()),
        count: z.coerce.number().int().min(1, 'Số câu tối thiểu là 1').max(100)
      })
    )
    .min(1, 'Cần ít nhất một điều kiện')
    .max(20)
});
export type AutoBody = z.infer<typeof autoBody>;
