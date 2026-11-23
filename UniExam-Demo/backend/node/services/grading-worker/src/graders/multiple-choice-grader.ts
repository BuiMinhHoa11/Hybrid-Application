import type { GradableQuestion, GradeOutcome, Grader } from './grader';

/**
 * Trắc nghiệm: đúng khi tập lựa chọn của sinh viên trùng khít tập đáp án đúng
 * (chọn thiếu hoặc chọn thừa đều không được điểm). Không bị trừ điểm khi sai.
 */
export const multipleChoiceGrader: Grader = {
  type: 'multiple_choice',
  grade(question: GradableQuestion, selectedOptionIds: string[]): GradeOutcome {
    const selected = new Set(selectedOptionIds);
    const correct = new Set(question.correctOptionIds);
    const isCorrect = correct.size > 0 && selected.size === correct.size && [...correct].every((id) => selected.has(id));
    return { correct: isCorrect, earned: isCorrect ? question.points : 0 };
  }
};
