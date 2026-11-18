export interface ExamAudienceRow {
  examId: string;
  studentId: string;
}

export const EXAM_AUDIENCE_COLUMNS = `exam_id AS "examId", student_id AS "studentId"`;
