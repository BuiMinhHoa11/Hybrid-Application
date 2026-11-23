import type { GraderRegistry } from '../graders';
import type { GradableQuestion } from '../graders/grader';

export interface SubmissionToGrade {
  answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
  questions: GradableQuestion[];
}

export interface QuestionDetail {
  questionId: string;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  correct: boolean;
  earned: number;
  max: number;
}

export interface GradedSubmission {
  score: number;
  maxScore: number;
  details: QuestionDetail[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Đối chiếu từng câu của đề với bài làm và cộng điểm theo barem (UC04A).
 * Câu bỏ trống tính 0 điểm. Câu sinh viên trả lời mà không thuộc đề bị bỏ qua.
 * Duyệt theo câu của đề nên điểm tối đa luôn đúng dù bài nộp thiếu hoặc thừa câu.
 */
export function gradeSubmission(input: SubmissionToGrade, registry: GraderRegistry): GradedSubmission {
  const answerBy = new Map(input.answers.map((a) => [a.questionId, a.selectedOptionIds]));
  let score = 0;
  let maxScore = 0;

  const details = input.questions.map((q): QuestionDetail => {
    const selected = answerBy.get(q.id) ?? [];
    const { correct, earned } = registry.get(q.type).grade(q, selected);
    score += earned;
    maxScore += q.points;
    return {
      questionId: q.id,
      selectedOptionIds: selected,
      correctOptionIds: q.correctOptionIds,
      correct,
      earned,
      max: q.points
    };
  });

  return { score: round2(score), maxScore: round2(maxScore), details };
}
