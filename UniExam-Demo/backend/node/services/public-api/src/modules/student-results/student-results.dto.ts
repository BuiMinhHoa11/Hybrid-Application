import type { ResultDisplayStatus } from '@uniexam/contracts';

export interface StudentResultItem {
  examId: string;
  title: string;
  subject: string;
  startedAt: Date;
  submittedAt: Date | null;
  status: ResultDisplayStatus;
  /** Chỉ có giá trị khi status = 'published' (UC01D). */
  score: number | null;
  maxScore: number | null;
}
