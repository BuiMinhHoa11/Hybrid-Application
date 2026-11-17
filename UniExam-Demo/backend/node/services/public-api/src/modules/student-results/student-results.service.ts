import type { ResultDisplayStatus } from '@uniexam/contracts';
import { notFound } from '@uniexam/observability';
import * as examResults from '../exam-results/exam-results.repository';
import { buildReview } from '../exam-results/review';
import type { StudentResultItem } from './student-results.dto';
import * as repo from './student-results.repository';
import type { StudentResultRow } from './student-results.repository';

export function displayStatus(row: Pick<StudentResultRow, 'sessionStatus' | 'submissionStatus' | 'resultsPublished'>): ResultDisplayStatus {
  if (row.sessionStatus === 'in_progress') return 'in_progress';
  if (row.submissionStatus === 'graded') return row.resultsPublished ? 'published' : 'graded';
  return 'pending_grading';
}

export function toItem(row: StudentResultRow): StudentResultItem {
  const status = displayStatus(row);
  const visible = status === 'published';
  return {
    examId: row.examId,
    title: row.title,
    subject: row.subject,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    status,
    // Điểm chỉ lộ ra khi giáo viên đã công bố.
    score: visible ? row.score : null,
    maxScore: visible ? row.maxScore : null
  };
}

export async function list(studentId: string) {
  const rows = await repo.listForStudent(studentId);
  return { items: rows.map(toItem) };
}

export async function detail(studentId: string, examId: string) {
  const rows = await repo.listForStudent(studentId);
  const row = rows.find((r) => r.examId === examId);
  if (!row) throw notFound('Bạn chưa làm bài của kỳ thi này');
  const item = toItem(row);
  if (item.status !== 'published') return { item, review: null };

  const exam = await examResults.findExam(examId);
  const header = await examResults.findSubmissionByStudent(examId, studentId);
  if (!exam?.paperId || !header) return { item, review: null };
  const questions = await examResults.listPaperQuestions(exam.paperId);
  return { item, review: buildReview(header, questions, true) };
}
