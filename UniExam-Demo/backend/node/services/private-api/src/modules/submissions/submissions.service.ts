import type { SubmissionCreatedEvent, SubmitReason } from '@uniexam/contracts';
import { withTransaction } from '@uniexam/db';
import { logger } from '../../logger';
import * as repo from './submissions.repository';

export interface FinalizeResult {
  submissionId: string;
  alreadySubmitted: boolean;
  total: number;
  answered: number;
  unanswered: number;
}

const countAnswered = (answers: Array<{ selectedOptionIds: string[] }>) =>
  answers.filter((a) => a.selectedOptionIds.length > 0).length;

/**
 * Chốt phiên làm bài (UC01C): khóa phiên, chụp đáp án hiện tại, tạo bài nộp ở trạng thái "chờ chấm".
 * Idempotent: gọi lại (nộp trùng, hoặc job tự nộp chạy song song) trả về bài nộp đã có.
 * Khóa dòng phiên bằng FOR UPDATE nên không lẫn với việc lưu đáp án đang diễn ra.
 */
export async function finalizeSession(sessionId: string, reason: SubmitReason): Promise<FinalizeResult | null> {
  const outcome = await withTransaction(async (tx) => {
    const session = await repo.lockSession(sessionId, tx);
    if (!session) return null;
    const total = await repo.paperQuestionCount(session.examId, tx);

    if (session.status === 'submitted') {
      const existing = await repo.findSubmissionBySession(sessionId, tx);
      const answered = countAnswered(existing?.answersSnapshot ?? []);
      return {
        result: { submissionId: existing!.id, alreadySubmitted: true, total, answered, unanswered: total - answered },
        event: null
      };
    }

    const snapshot = await repo.answersOf(sessionId, tx);
    await repo.markSubmitted(sessionId, reason, tx);
    const submission = await repo.insertSubmission(session, snapshot, tx);
    const answered = countAnswered(snapshot);
    const event: SubmissionCreatedEvent = {
      type: 'submission.created',
      submissionId: submission.id,
      sessionId,
      examId: session.examId,
      studentId: session.studentId,
      reason,
      submittedAt: submission.submittedAt.toISOString()
    };
    return {
      result: { submissionId: submission.id, alreadySubmitted: false, total, answered, unanswered: total - answered },
      event
    };
  });

  if (!outcome) return null;
  // Phát event sau khi commit; worker nhận bài bằng polling nên event ở đây phục vụ theo dõi/log.
  if (outcome.event) logger.info('event', { event: outcome.event });
  return outcome.result;
}
