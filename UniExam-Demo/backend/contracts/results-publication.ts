export interface ResultsPublicationState {
  audience: number;
  submitted: number;
  openSessions: number;
  ungraded: number;
}

export interface ResultsPublication {
  canPublish: boolean;
  early: boolean;
  blockedReason?: string;
  code?: string;
}

/** Công bố sớm chỉ khi mọi người trong danh sách dự thi đã nộp, không còn bài đang làm. */
export function resultsPublication(
  exam: { status: string; resultsPublished: boolean },
  state: ResultsPublicationState
): ResultsPublication {
  const block = (code: string, blockedReason: string): ResultsPublication => ({ canPublish: false, early: false, code, blockedReason });
  if (exam.resultsPublished) return block('ALREADY_PUBLISHED', 'Kết quả kỳ thi này đã được công bố');
  if (!['published', 'open', 'locked', 'closed'].includes(exam.status)) return block('EXAM_NOT_PUBLISHED', 'Kỳ thi chưa được phát hành');
  if (state.openSessions > 0) return block('EXAM_IN_PROGRESS', `Còn ${state.openSessions} thí sinh đang làm bài`);
  if (exam.status !== 'closed' && (state.audience === 0 || state.submitted < state.audience)) {
    return block('EXAM_NOT_CLOSED', `Mới có ${state.submitted}/${state.audience} thí sinh nộp bài. Chỉ công bố sớm khi tất cả thí sinh đã nộp; nếu có người vắng, hãy chờ kỳ thi kết thúc.`);
  }
  if (state.ungraded > 0) return block('GRADING_PENDING', `Còn ${state.ungraded} bài chưa chấm xong`);
  return { canPublish: true, early: exam.status !== 'closed' };
}
