import { normalizeTextAnswer } from '@uniexam/contracts';
import type { Grader } from './grader';

/** Một ô trả lời; khớp một trong các đáp án được chấp nhận thì nhận đủ điểm. */
export const fillBlankGrader: Grader = {
  type: 'fill_blank',
  grade(question, answers) {
    const answer = answers.length === 1 ? normalizeTextAnswer(answers[0]) : '';
    const correct = answer.length > 0 && question.correctOptionIds.some((accepted) => normalizeTextAnswer(accepted) === answer);
    return { correct, earned: correct ? question.points : 0 };
  }
};
