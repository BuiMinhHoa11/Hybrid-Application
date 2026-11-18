import { z } from 'zod';

export const startSessionBody = z.object({
  examId: z.string().uuid('Mã kỳ thi không hợp lệ')
});

/** Câu hỏi gửi cho sinh viên: cố ý không có correctOptionIds. */
export interface SessionQuestionDto {
  id: string;
  type: string;
  position: number;
  content: string;
  options: Array<{ id: string; text: string }>;
  points: number;
  /** Câu có nhiều đáp án đúng: giao diện dùng ô chọn nhiều. */
  allowMultiple: boolean;
}
