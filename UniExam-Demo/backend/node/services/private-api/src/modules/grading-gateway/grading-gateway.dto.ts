import { z } from 'zod';

export const submissionIdParam = z.object({ submissionId: z.string().uuid() });

const detail = z.object({
  questionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string()),
  correctOptionIds: z.array(z.string()),
  correct: z.boolean(),
  earned: z.number().min(0),
  max: z.number().min(0)
});

export const resultBody = z
  .object({
    workerId: z.string().max(100).default(''),
    score: z.number().min(0),
    maxScore: z.number().min(0),
    details: z.array(detail).max(1000)
  })
  .refine((b) => b.score <= b.maxScore + 1e-9, { message: 'Điểm không được lớn hơn điểm tối đa', path: ['score'] });
export type ResultBody = z.infer<typeof resultBody>;

export const failBody = z.object({ reason: z.string().trim().max(500).default('Lỗi không xác định') });

/** Dữ liệu worker cần để chấm một bài: đáp án sinh viên + đáp án đúng và barem từ đề. */
export interface ClaimedSubmission {
  submissionId: string;
  examId: string;
  studentId: string;
  attempt: number;
  answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
  questions: Array<{ id: string; type: string; points: number; correctOptionIds: string[] }>;
}
