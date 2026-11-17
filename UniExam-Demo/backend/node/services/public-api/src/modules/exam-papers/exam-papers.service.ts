import type { AuthUser } from '@uniexam/auth';
import type { QuestionRow } from '@uniexam/db';
import { conflict, notFound, unprocessable } from '@uniexam/observability';
import type { AutoBody, PaperBody } from './exam-papers.dto';
import * as repo from './exam-papers.repository';
import { pickQuestions } from './paper-generator';

const scope = (user: AuthUser) => (user.role === 'admin' ? undefined : user.id);

/** Câu hỏi hợp lệ để đưa vào đề: có đáp án đúng nằm trong lựa chọn và điểm > 0. */
export function isQuestionComplete(q: Pick<QuestionRow, 'type' | 'options' | 'correctOptionIds' | 'points' | 'content'>): boolean {
  if (q.type === 'fill_blank') {
    return q.content.trim().length > 0 && q.points > 0 && q.options.length === 0 &&
      q.correctOptionIds.length > 0 && q.correctOptionIds.every((answer) => answer.trim().length > 0);
  }
  const ids = new Set(q.options.map((o) => o.id));
  return (
    q.content.trim().length > 0 &&
    q.points > 0 &&
    q.correctOptionIds.length > 0 &&
    q.correctOptionIds.every((id) => ids.has(id))
  );
}

export async function list(user: AuthUser) {
  return { items: await repo.list(scope(user)) };
}

export async function get(user: AuthUser, id: string) {
  const paper = await repo.findPaper(id, scope(user));
  if (!paper) throw notFound('Không tìm thấy đề thi');
  const questions = await repo.listPaperQuestions(id);
  return {
    paper,
    questions,
    totalPoints: questions.reduce((sum, q) => sum + q.points, 0)
  };
}

export async function create(user: AuthUser, body: PaperBody) {
  const found = await repo.findQuestionsByIds(body.questionIds, scope(user));
  if (found.length !== body.questionIds.length) {
    throw unprocessable('Có câu hỏi không tồn tại hoặc không thuộc ngân hàng của bạn');
  }
  if (body.expectedCount !== undefined && body.expectedCount !== body.questionIds.length) {
    throw unprocessable(`Đề cần đúng ${body.expectedCount} câu nhưng đang chọn ${body.questionIds.length} câu`);
  }
  const incomplete = found.filter((q) => !isQuestionComplete(q));
  if (incomplete.length) {
    throw unprocessable(`Có ${incomplete.length} câu thiếu đáp án đúng hoặc điểm`, { questionIds: incomplete.map((q) => q.id) });
  }
  const id = await repo.createPaper(user.id, body);
  return get(user, id);
}

/** Sinh danh sách câu hỏi theo điều kiện để giáo viên xem trước và điều chỉnh; chưa lưu gì. */
export async function autoPreview(user: AuthUser, body: AutoBody) {
  const pool = (await repo.candidatesBySubject(body.subject, scope(user))).filter(isQuestionComplete);
  const { picked, shortages } = pickQuestions(pool, body.rules);
  if (shortages.length) {
    throw unprocessable(
      'Ngân hàng câu hỏi không đủ câu theo điều kiện',
      shortages.map((s) => ({
        ruleIndex: s.ruleIndex,
        message: `Điều kiện ${s.ruleIndex + 1}: cần ${s.requested} câu nhưng chỉ có ${s.available} câu`
      }))
    );
  }
  return { questions: picked, totalPoints: picked.reduce((sum, q) => sum + q.points, 0) };
}

export async function remove(user: AuthUser, id: string) {
  if (!(await repo.findPaper(id, scope(user)))) throw notFound('Không tìm thấy đề thi');
  if (await repo.isUsedByExam(id)) throw conflict('Đề thi đang được dùng trong một kỳ thi nên không thể xóa', 'PAPER_IN_USE');
  await repo.removePaper(id, scope(user));
  return { deleted: true };
}
