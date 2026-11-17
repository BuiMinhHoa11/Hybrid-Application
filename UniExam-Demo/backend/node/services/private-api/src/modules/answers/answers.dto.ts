import { z } from 'zod';
import { MAX_TEXT_ANSWER_LENGTH } from '@uniexam/contracts';

export const answerParams = z.object({
  id: z.string().uuid('Mã phiên không hợp lệ'),
  questionId: z.string().uuid('Mã câu hỏi không hợp lệ')
});

/** Cập nhật từng phần: gửi selectedOptionIds, flagged hoặc cả hai. */
export const saveAnswerBody = z
  .object({
    selectedOptionIds: z.array(z.string().min(1).max(MAX_TEXT_ANSWER_LENGTH)).max(8).optional(),
    flagged: z.boolean().optional()
  })
  .refine((b) => b.selectedOptionIds !== undefined || b.flagged !== undefined, {
    message: 'Cần gửi selectedOptionIds hoặc flagged'
  });
export type SaveAnswerBody = z.infer<typeof saveAnswerBody>;
