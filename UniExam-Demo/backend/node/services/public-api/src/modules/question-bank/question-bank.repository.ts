import { QUESTION_COLUMNS, query, queryOne, type QuestionRow } from '@uniexam/db';
import type { ListQuery, QuestionBody } from './question-bank.dto';

/** ownerId = undefined nghĩa là không giới hạn theo chủ sở hữu (quản trị viên). */
export async function list(q: ListQuery, ownerId?: string): Promise<{ items: QuestionRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (ownerId) add('owner_id = ?', ownerId);
  if (q.subject) add('subject = ?', q.subject);
  if (q.chapter) add('chapter = ?', q.chapter);
  if (q.topic) add('topic = ?', q.topic);
  if (q.difficulty) add('difficulty = ?', q.difficulty);
  if (q.type) add('type = ?', q.type);
  if (q.q) add(`content ILIKE ? ESCAPE '\\'`, `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM questions ${clause}`, params);
  const items = await query<QuestionRow>(
    `SELECT ${QUESTION_COLUMNS} FROM questions ${clause}
     ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );
  return { items, total: total?.n ?? 0 };
}

export function findById(id: string, ownerId?: string): Promise<QuestionRow | null> {
  return queryOne<QuestionRow>(
    `SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2)`,
    [id, ownerId ?? null]
  );
}

export async function insert(ownerId: string, b: QuestionBody): Promise<QuestionRow> {
  const row = await queryOne<QuestionRow>(
    `INSERT INTO questions (owner_id, subject, chapter, topic, difficulty, type, content, options, correct_option_ids, points)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING ${QUESTION_COLUMNS}`,
    [ownerId, b.subject, b.chapter, b.topic, b.difficulty, b.type, b.content, JSON.stringify(b.options), b.correctOptionIds, b.points]
  );
  return row!;
}

export function update(id: string, b: QuestionBody, ownerId?: string): Promise<QuestionRow | null> {
  return queryOne<QuestionRow>(
    `UPDATE questions SET subject = $3, chapter = $4, topic = $5, difficulty = $6, type = $7, content = $8,
            options = $9::jsonb, correct_option_ids = $10, points = $11, updated_at = now()
     WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2) RETURNING ${QUESTION_COLUMNS}`,
    [id, ownerId ?? null, b.subject, b.chapter, b.topic, b.difficulty, b.type, b.content, JSON.stringify(b.options), b.correctOptionIds, b.points]
  );
}

export async function remove(id: string, ownerId?: string): Promise<boolean> {
  const rows = await query(`DELETE FROM questions WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2) RETURNING id`, [id, ownerId ?? null]);
  return rows.length > 0;
}

export async function filterOptions(ownerId?: string) {
  const rows = await query<{ subject: string; chapter: string; topic: string }>(
    `SELECT DISTINCT subject, chapter, topic FROM questions WHERE ($1::uuid IS NULL OR owner_id = $1) ORDER BY subject, chapter, topic`,
    [ownerId ?? null]
  );
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  return {
    subjects: uniq(rows.map((r) => r.subject)),
    chapters: uniq(rows.map((r) => r.chapter)),
    topics: uniq(rows.map((r) => r.topic))
  };
}
