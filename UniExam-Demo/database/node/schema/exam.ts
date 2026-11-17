import type { ExamStatus } from '@uniexam/contracts';

export interface ExamRow {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  description: string;
  format: string;
  paperId: string | null;
  /** NULL: hiện ngay khi phát hành; có giá trị: chỉ hiện từ thời điểm này. */
  publishAt: Date | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  questionCount: number;
  status: ExamStatus;
  resultsPublished: boolean;
  resultsPublishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const EXAM_COLUMNS = `
  id, owner_id AS "ownerId", title, subject, description, format, paper_id AS "paperId",
  publish_at AS "publishAt", start_time AS "startTime", end_time AS "endTime", duration_minutes AS "durationMinutes",
  question_count AS "questionCount", status,
  results_published AS "resultsPublished", results_published_at AS "resultsPublishedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
