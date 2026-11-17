import type { Difficulty, ExamStatus } from '@uniexam/contracts';

export interface StudentExam {
  id: string;
  title: string;
  subject: string;
  description?: string;
  format: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  questionCount: number;
  status: ExamStatus;
  /** upcoming: chưa đến giờ, open: đang mở, ended: đã hết khung giờ */
  availability: 'upcoming' | 'open' | 'ended';
  sessionId: string | null;
  sessionStatus: 'in_progress' | 'submitted' | null;
  canStart: boolean;
}

export interface TeacherExam {
  id: string;
  title: string;
  subject: string;
  description: string;
  format: string;
  paperId: string | null;
  publishAt: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  questionCount: number;
  status: ExamStatus;
  resultsPublished: boolean;
  audienceCount?: number;
  paperTitle?: string | null;
}

export interface AudienceMember {
  id: string;
  username: string;
  fullName: string;
}

/** Dữ liệu gửi lên khi lưu nháp / cập nhật kỳ thi (thời gian ở dạng ISO). */
export interface ExamInput {
  title: string;
  subject: string;
  description: string;
  paperId: string | null;
  publishAt: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  questionCount: number;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface PaperListItem {
  id: string;
  title: string;
  subject: string;
  description: string;
  createdAt: string;
  questionCount: number;
  totalPoints: number;
  inUse: boolean;
}

export interface PaperQuestion {
  id: string;
  type: string;
  position: number;
  content: string;
  options: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  points: number;
  chapter: string;
  topic: string;
  difficulty: Difficulty;
}

export interface PaperDetail {
  paper: Omit<PaperListItem, 'questionCount' | 'totalPoints' | 'inUse'>;
  questions: PaperQuestion[];
  totalPoints: number;
}
