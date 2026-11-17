import { z } from 'zod';
import type { QuestionOption } from '@uniexam/db';

export const examIdParam = z.object({ examId: z.string().uuid('Mã kỳ thi không hợp lệ') });
export const submissionParam = examIdParam.extend({ submissionId: z.string().uuid('Mã bài nộp không hợp lệ') });

/** Bước "Xác nhận" của UC02D: client phải gửi confirm: true. */
export const publishResultsDto = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'Cần xác nhận trước khi công bố kết quả' }) })
});

export interface ReviewedQuestion {
  id: string;
  type: string;
  position: number;
  content: string;
  options: QuestionOption[];
  points: number;
  selectedOptionIds: string[];
  /** Chỉ có khi được phép lộ đáp án (giáo viên, hoặc sinh viên sau khi công bố). */
  correctOptionIds?: string[];
  correct?: boolean | null;
  earned?: number | null;
}

export interface SubmissionReview {
  submission: {
    id: string;
    status: string;
    submittedAt: Date;
    submitReason: string | null;
  };
  result: { score: number; maxScore: number } | null;
  questions: ReviewedQuestion[];
}
