export interface GradableQuestion {
  id: string;
  type: string;
  /** Điểm tối đa của câu theo barem */
  points: number;
  /** Mã lựa chọn hoặc các đáp án văn bản được chấp nhận, tùy type. */
  correctOptionIds: string[];
}

export interface GradeOutcome {
  correct: boolean;
  earned: number;
}

/**
 * Giao diện chung cho mọi loại câu hỏi. Thêm loại mới (điền khuyết, tự luận chấm tay, ...)
 * bằng cách cài đặt Grader rồi đăng ký trong graders/index.ts.
 */
export interface Grader {
  readonly type: string;
  grade(question: GradableQuestion, selectedOptionIds: string[]): GradeOutcome;
}
