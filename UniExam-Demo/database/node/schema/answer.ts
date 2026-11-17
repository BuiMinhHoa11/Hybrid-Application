export interface AnswerRow {
  id: string;
  sessionId: string;
  questionId: string;
  selectedOptionIds: string[];
  flagged: boolean;
  updatedAt: Date;
}

export const ANSWER_COLUMNS = `
  id, session_id AS "sessionId", question_id AS "questionId",
  selected_option_ids AS "selectedOptionIds", flagged, updated_at AS "updatedAt"`;
