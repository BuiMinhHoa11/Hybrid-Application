import type { ExamStatus } from '@uniexam/contracts';

/**
 * DTO gửi cho sinh viên. Cố ý KHÔNG có paperId, câu hỏi, đáp án hay dữ liệu riêng của đề.
 * Mọi truy vấn ở repository chỉ chọn đúng các cột này.
 */
export interface StudentExamDto {
  id: string;
  title: string;
  subject: string;
  description?: string;
  format: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  questionCount: number;
  status: ExamStatus;
  /** upcoming: chưa đến giờ, open: đang mở, ended: đã hết khung giờ */
  availability: 'upcoming' | 'open' | 'ended';
  sessionId: string | null;
  sessionStatus: 'in_progress' | 'submitted' | null;
  canStart: boolean;
}
