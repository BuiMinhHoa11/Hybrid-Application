import type { AuthUser } from '@uniexam/auth';
import { conflict, forbidden, notFound } from '@uniexam/observability';
import type { ExamSessionRow } from '@uniexam/db';
import { finalizeSession } from '../submissions/submissions.service';
import * as repo from './exam-sessions.repository';
import { canStartNow, computeExpiry } from './session-time';

const sessionDto = (s: ExamSessionRow) => ({
  id: s.id,
  examId: s.examId,
  status: s.status,
  startedAt: s.startedAt,
  expiresAt: s.expiresAt,
  submittedAt: s.submittedAt,
  submitReason: s.submitReason
});

/**
 * UC01B: kiểm tra quyền dự thi, trạng thái kỳ thi và thời gian hiện tại, rồi tạo (hoặc tiếp tục) phiên làm bài.
 */
export async function start(user: AuthUser, examId: string) {
  const exam = await repo.findExam(examId);
  // Không phân biệt "không tồn tại" và "không thuộc đối tượng dự thi".
  if (!exam || exam.status === 'draft' || (exam.publishAt && exam.publishAt > new Date()) || !(await repo.isInAudience(examId, user.id))) {
    throw notFound('Không tìm thấy kỳ thi hoặc bạn không thuộc đối tượng dự thi');
  }

  const existing = await repo.findByExamAndStudent(examId, user.id);
  if (existing?.status === 'submitted') throw conflict('Bạn đã nộp bài của kỳ thi này', 'ALREADY_SUBMITTED');

  const now = new Date();
  if (existing) {
    if (existing.expiresAt > now) return { session: sessionDto(existing), serverTime: now, resumed: true };
    await finalizeSession(existing.id, 'timeout');
    throw conflict('Đã hết thời gian làm bài, bài của bạn đã được tự động nộp', 'TIME_UP');
  }

  if (!exam.paperId) throw conflict('Kỳ thi chưa có đề', 'NO_PAPER');
  if (!canStartNow(exam, now)) {
    if (now < exam.startTime) throw conflict('Kỳ thi chưa đến giờ bắt đầu', 'NOT_STARTED');
    throw conflict('Kỳ thi đã kết thúc hoặc không còn mở', 'EXAM_CLOSED');
  }

  const expiresAt = computeExpiry(now, exam.durationMinutes, exam.endTime);
  const session = await repo.createSession(examId, user.id, expiresAt);
  return { session: sessionDto(session), serverTime: now, resumed: false };
}

/**
 * Tải phiên cùng đề thi (không có đáp án đúng) và các đáp án đã lưu.
 * Nếu đã quá giờ mà chưa nộp thì khóa và tự nộp ngay tại đây, không phụ thuộc job nền.
 */
export async function get(user: AuthUser, sessionId: string) {
  let session = await repo.findById(sessionId);
  if (!session || session.studentId !== user.id) throw notFound('Không tìm thấy phiên làm bài');

  const exam = await repo.findExam(session.examId);
  if (!exam) throw notFound('Không tìm thấy kỳ thi');

  if (session.status === 'in_progress' && session.expiresAt <= new Date()) {
    await finalizeSession(session.id, 'timeout');
    session = (await repo.findById(sessionId))!;
  }

  const base = {
    serverTime: new Date(),
    session: sessionDto(session),
    exam: { id: exam.id, title: exam.title, subject: exam.subject, durationMinutes: exam.durationMinutes }
  };

  // Phiên đã khóa: không trả lại đề, sinh viên không còn sửa được gì.
  if (session.status !== 'in_progress') return { ...base, questions: [], answers: {} };
  if (!exam.paperId) throw forbidden('Kỳ thi chưa có đề');

  const [questions, answers] = await Promise.all([repo.listQuestionsForStudent(exam.paperId), repo.listAnswers(sessionId)]);
  return {
    ...base,
    questions,
    answers: Object.fromEntries(answers.map((a) => [a.questionId, { selectedOptionIds: a.selectedOptionIds, flagged: a.flagged }]))
  };
}
