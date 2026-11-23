import type { AuthUser } from '@uniexam/auth';
import { withTransaction } from '@uniexam/db';
import { conflict, notFound, unprocessable } from '@uniexam/observability';
import { finalizeSession } from '../submissions/submissions.service';
import type { SaveAnswerBody } from './answers.dto';
import * as repo from './answers.repository';

/**
 * UC01B: tự lưu đáp án sau mỗi lần chọn hoặc đánh dấu xem lại.
 * Khi phiên đã nộp hoặc hết giờ thì từ chối, sinh viên không sửa được nữa.
 */
export async function save(user: AuthUser, sessionId: string, questionId: string, body: SaveAnswerBody) {
  const outcome = await withTransaction(async (tx) => {
    const session = await repo.lockSessionShared(sessionId, tx);
    if (!session || session.studentId !== user.id) throw notFound('Không tìm thấy phiên làm bài');
    if (session.status !== 'in_progress') {
      throw conflict('Bài đã được nộp, không thể sửa đáp án', 'SESSION_LOCKED');
    }
    if (session.expired) return { expired: true as const };

    const question = await repo.questionForAnswer(session.examId, questionId, tx);
    if (!question) throw notFound('Câu hỏi không thuộc đề thi của bạn');

    let selected: string[] | null = null;
    if (body.selectedOptionIds !== undefined) {
      if (question.type === 'fill_blank') {
        if (body.selectedOptionIds.length > 1) throw unprocessable('Chỉ nhập một câu trả lời cho chỗ trống');
        selected = body.selectedOptionIds.filter((answer) => answer.trim().length > 0);
      } else {
        selected = [...new Set(body.selectedOptionIds)];
        const validIds = question.options.map((o) => o.id);
        if (selected.some((id) => !validIds.includes(id))) {
          throw unprocessable('Lựa chọn không hợp lệ cho câu hỏi này');
        }
      }
    }
    const saved = await repo.upsertAnswer(sessionId, questionId, selected, body.flagged ?? null, tx);
    return { expired: false as const, saved };
  });

  if (outcome.expired) {
    // Đã quá giờ: khóa và tự nộp, rồi báo cho client để chuyển sang màn hình đã nộp.
    await finalizeSession(sessionId, 'timeout');
    throw conflict('Đã hết thời gian làm bài, bài của bạn đã được tự động nộp', 'TIME_UP');
  }
  return { ...outcome.saved, questionId };
}
