import {
  EXAM_PAPER_COLUMNS,
  PAPER_QUESTION_COLUMNS,
  QUESTION_COLUMNS,
  query,
  queryOne,
  withTransaction,
  type ExamPaperRow,
  type PaperQuestionRow,
  type QuestionRow
} from '@uniexam/db';
import type { PaperBody } from './exam-papers.dto';

export interface PaperListItem extends ExamPaperRow {
  questionCount: number;
  totalPoints: number;
  inUse: boolean;
}

export function list(ownerId?: string): Promise<PaperListItem[]> {
  return query<PaperListItem>(
    `SELECT p.id, p.owner_id AS "ownerId", p.title, p.subject, p.description, p.created_at AS "createdAt",
            count(pq.id) AS "questionCount", coalesce(sum(pq.points), 0) AS "totalPoints",
            EXISTS (SELECT 1 FROM exams e WHERE e.paper_id = p.id) AS "inUse"
     FROM exam_papers p
     LEFT JOIN exam_paper_questions pq ON pq.paper_id = p.id
     WHERE ($1::uuid IS NULL OR p.owner_id = $1)
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [ownerId ?? null]
  );
}

export function findPaper(id: string, ownerId?: string): Promise<ExamPaperRow | null> {
  return queryOne<ExamPaperRow>(
    `SELECT ${EXAM_PAPER_COLUMNS} FROM exam_papers WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2)`,
    [id, ownerId ?? null]
  );
}

export function listPaperQuestions(paperId: string): Promise<PaperQuestionRow[]> {
  return query<PaperQuestionRow>(
    `SELECT ${PAPER_QUESTION_COLUMNS} FROM exam_paper_questions WHERE paper_id = $1 ORDER BY position`,
    [paperId]
  );
}

export function findQuestionsByIds(ids: string[], ownerId?: string): Promise<QuestionRow[]> {
  return query<QuestionRow>(
    `SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = ANY($1::uuid[]) AND ($2::uuid IS NULL OR owner_id = $2)`,
    [ids, ownerId ?? null]
  );
}

export function candidatesBySubject(subject: string, ownerId?: string): Promise<QuestionRow[]> {
  return query<QuestionRow>(
    `SELECT ${QUESTION_COLUMNS} FROM questions WHERE subject = $1 AND ($2::uuid IS NULL OR owner_id = $2)`,
    [subject, ownerId ?? null]
  );
}

/** Lưu đề cùng bản chụp câu hỏi trong một transaction (đề cố định, không đổi theo ngân hàng). */
export function createPaper(ownerId: string, body: PaperBody): Promise<string> {
  return withTransaction(async (tx) => {
    const paper = await queryOne<{ id: string }>(
      `INSERT INTO exam_papers (owner_id, title, subject, description) VALUES ($1, $2, $3, $4) RETURNING id`,
      [ownerId, body.title, body.subject, body.description],
      tx
    );
    await query(
      `INSERT INTO exam_paper_questions
         (paper_id, position, question_id, type, content, options, correct_option_ids, points, chapter, topic, difficulty)
       SELECT $1, u.pos, q.id, q.type, q.content, q.options, q.correct_option_ids, q.points, q.chapter, q.topic, q.difficulty
       FROM unnest($2::uuid[]) WITH ORDINALITY AS u(qid, pos)
       JOIN questions q ON q.id = u.qid`,
      [paper!.id, body.questionIds],
      tx
    );
    return paper!.id;
  });
}

export async function isUsedByExam(paperId: string): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM exams WHERE paper_id = $1', [paperId])) !== null;
}

export async function removePaper(id: string, ownerId?: string): Promise<boolean> {
  const rows = await query(`DELETE FROM exam_papers WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2) RETURNING id`, [id, ownerId ?? null]);
  return rows.length > 0;
}
