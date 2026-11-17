import type { GradingDetail, PaperQuestionRow } from '@uniexam/db';
import type { ReviewedQuestion, SubmissionReview } from './exam-results.dto';
import type { SubmissionHeader } from './exam-results.repository';

/**
 * Ghép câu hỏi của đề với bài làm và kết quả chấm.
 * revealAnswerKey=false: không đưa đáp án đúng và kết quả từng câu ra ngoài.
 */
export function buildReview(
  header: SubmissionHeader,
  paperQuestions: PaperQuestionRow[],
  revealAnswerKey: boolean
): SubmissionReview {
  const selectedBy = new Map(header.answersSnapshot.map((a) => [a.questionId, a.selectedOptionIds]));
  const detailBy = new Map<string, GradingDetail>((header.details ?? []).map((d) => [d.questionId, d]));

  const questions: ReviewedQuestion[] = paperQuestions.map((q) => {
    const base: ReviewedQuestion = {
      id: q.id,
      type: q.type,
      position: q.position,
      content: q.content,
      options: q.options,
      points: q.points,
      selectedOptionIds: selectedBy.get(q.id) ?? []
    };
    if (!revealAnswerKey) return base;
    const d = detailBy.get(q.id);
    return { ...base, correctOptionIds: q.correctOptionIds, correct: d?.correct ?? null, earned: d?.earned ?? null };
  });

  const graded = header.status === 'graded' && header.score !== null && header.maxScore !== null;
  return {
    submission: {
      id: header.id,
      status: header.status,
      submittedAt: header.submittedAt,
      submitReason: header.submitReason
    },
    result: revealAnswerKey && graded ? { score: header.score!, maxScore: header.maxScore! } : null,
    questions
  };
}
