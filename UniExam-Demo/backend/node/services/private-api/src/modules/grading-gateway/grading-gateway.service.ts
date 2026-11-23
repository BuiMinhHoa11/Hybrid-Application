import type { SubmissionGradedEvent } from '@uniexam/contracts';
import { conflict, notFound } from '@uniexam/observability';
import { logger } from '../../logger';
import type { ClaimedSubmission, ResultBody } from './grading-gateway.dto';
import * as repo from './grading-gateway.repository';

/** Worker lấy bài nộp kế tiếp cùng đáp án đúng và barem. null nghĩa là hàng đợi trống. */
export async function claim(): Promise<ClaimedSubmission | null> {
  await repo.failStuck();
  const row = await repo.claimNext();
  if (!row) return null;
  return {
    submissionId: row.id,
    examId: row.examId,
    studentId: row.studentId,
    attempt: row.attempts,
    answers: row.answers,
    questions: await repo.questionsOfExam(row.examId)
  };
}

export async function submitResult(submissionId: string, body: ResultBody) {
  const out = await repo.saveResult(submissionId, body);
  if (!out.ok) {
    if (out.reason === 'not_found') throw notFound('Không tìm thấy bài nộp');
    throw conflict('Bài nộp không ở trạng thái đang chấm', 'BAD_STATE');
  }
  const event: SubmissionGradedEvent = {
    type: 'submission.graded',
    submissionId,
    examId: out.examId,
    studentId: out.studentId,
    score: body.score,
    maxScore: body.maxScore,
    gradedAt: out.gradedAt.toISOString()
  };
  logger.info('event', { event });
  return { status: 'graded' as const };
}

export async function reportFailure(submissionId: string, reason: string) {
  const outcome = await repo.releaseOrFail(submissionId, reason);
  if (outcome === 'not_found') throw conflict('Bài nộp không ở trạng thái đang chấm', 'BAD_STATE');
  logger.warn('Chấm bài thất bại', { submissionId, reason, outcome });
  return { status: outcome };
}
