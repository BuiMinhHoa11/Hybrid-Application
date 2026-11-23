import type { Grader } from './grader';
import { multipleChoiceGrader } from './multiple-choice-grader';
import { fillBlankGrader } from './fill-blank-grader';

export type { Grader, GradableQuestion, GradeOutcome } from './grader';
export { multipleChoiceGrader } from './multiple-choice-grader';
export { fillBlankGrader } from './fill-blank-grader';

export class GraderRegistry {
  private readonly byType = new Map<string, Grader>();

  constructor(graders: Grader[] = [multipleChoiceGrader, fillBlankGrader]) {
    for (const g of graders) this.byType.set(g.type, g);
  }

  get(type: string): Grader {
    const grader = this.byType.get(type);
    if (!grader) throw new Error(`Chưa có grader cho loại câu hỏi "${type}"`);
    return grader;
  }
}
