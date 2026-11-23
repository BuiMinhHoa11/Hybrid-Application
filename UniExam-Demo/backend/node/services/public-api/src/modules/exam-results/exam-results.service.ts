import type { AuthUser } from '@uniexam/auth';
import { conflict, forbidden, notFound } from '@uniexam/observability';
import { resultsPublication } from '@uniexam/contracts';
import * as repo from './exam-results.repository';
import { buildReview } from './review';

/** Giáo viên chỉ thao tác trên kỳ thi của mình; quản trị viên xem được tất cả. */
async function loadOwnedExam(user: AuthUser, examId: string) {
  const exam = await repo.findExam(examId);
  if (!exam || exam.status === 'draft') throw notFound('Không tìm thấy kỳ thi');
  if (user.role !== 'admin' && exam.ownerId !== user.id) throw forbidden('Bạn không có quyền với kỳ thi này');
  return exam;
}

export async function listExams(user: AuthUser) {
  return { items: await repo.listExamSummaries(user.role === 'admin' ? undefined : user.id) };
}

export async function examResults(user: AuthUser, examId: string) {
  const exam = await loadOwnedExam(user, examId);
  const [rows, state] = await Promise.all([repo.listResultRows(examId), repo.publicationState(examId)]);
  const graded = rows.filter((r) => r.submissionStatus === 'graded' && r.score !== null && r.maxScore !== null);
  const average = graded.length ? graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length : null;
  return {
    exam,
    rows,
    publication: resultsPublication(exam, state),
    stats: {
      audience: rows.length,
      started: rows.filter((r) => r.sessionStatus !== null).length,
      submitted: rows.filter((r) => r.submissionId !== null).length,
      graded: graded.length,
      averageScore: average === null ? null : Math.round(average * 100) / 100
    }
  };
}

export async function submissionDetail(user: AuthUser, examId: string, submissionId: string) {
  const exam = await loadOwnedExam(user, examId);
  const header = await repo.findSubmissionById(examId, submissionId);
  if (!header || !exam.paperId) throw notFound('Không tìm thấy bài nộp');
  const questions = await repo.listPaperQuestions(exam.paperId);
  return buildReview(header, questions, true);
}

export async function publishResults(user: AuthUser, examId: string) {
  const exam = await loadOwnedExam(user, examId);
  const publication = resultsPublication(exam, await repo.publicationState(examId));
  if (!publication.canPublish) throw conflict(publication.blockedReason!, publication.code);
  if (!(await repo.markResultsPublished(examId))) {
    const latest = await loadOwnedExam(user, examId);
    const current = resultsPublication(latest, await repo.publicationState(examId));
    throw conflict(current.blockedReason ?? 'Trạng thái bài thi vừa thay đổi, hãy tải lại trang', current.code ?? 'STATE_CHANGED');
  }
  return { published: true, publishedAt: new Date() };
}
