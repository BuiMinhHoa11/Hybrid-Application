export interface GradingDetail {
  questionId: string;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  correct: boolean;
  earned: number;
  max: number;
}

export interface GradingResultRow {
  id: string;
  submissionId: string;
  score: number;
  maxScore: number;
  details: GradingDetail[];
  gradedBy: string;
  createdAt: Date;
}

export const GRADING_RESULT_COLUMNS = `
  id, submission_id AS "submissionId", score, max_score AS "maxScore", details,
  graded_by AS "gradedBy", created_at AS "createdAt"`;
