import { EXAM_COLUMNS, query, queryOne, withTransaction, type ExamRow } from '@uniexam/db';
import type { CreateExamBody, ListExamsQuery, UpdateExamBody } from './exams.dto';

export interface ExamListItem extends ExamRow {
  audienceCount: number;
  paperTitle: string | null;
}

export async function list(q: ListExamsQuery, ownerId?: string): Promise<{ items: ExamListItem[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (ownerId) add('e.owner_id = ?', ownerId);
  if (q.status) add('e.status = ?', q.status);
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const i = params.length;
    where.push(`(e.title ILIKE $${i} ESCAPE '\\' OR e.subject ILIKE $${i} ESCAPE '\\')`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM exams e ${clause}`, params);
  const cols = EXAM_COLUMNS.split(',').map((c) => `e.${c.trim()}`).join(', ');
  const items = await query<ExamListItem>(
    `SELECT ${cols},
            (SELECT count(*) FROM exam_audience a WHERE a.exam_id = e.id) AS "audienceCount",
            (SELECT p.title FROM exam_papers p WHERE p.id = e.paper_id) AS "paperTitle"
     FROM exams e ${clause}
     ORDER BY e.start_time DESC, e.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );
  return { items, total: total?.n ?? 0 };
}

export function findById(id: string): Promise<ExamRow | null> {
  return queryOne<ExamRow>(`SELECT ${EXAM_COLUMNS} FROM exams WHERE id = $1`, [id]);
}

export async function insert(ownerId: string, b: CreateExamBody): Promise<ExamRow> {
  const row = await queryOne<ExamRow>(
    `INSERT INTO exams (owner_id, title, subject, description, format, paper_id, start_time, end_time,
                        duration_minutes, question_count, publish_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${EXAM_COLUMNS}`,
    [ownerId, b.title, b.subject, b.description, b.format, b.paperId ?? null, b.startTime, b.endTime, b.durationMinutes, b.questionCount, b.publishAt]
  );
  return row!;
}

const UPDATABLE: Record<keyof UpdateExamBody, string> = {
  title: 'title',
  subject: 'subject',
  description: 'description',
  format: 'format',
  paperId: 'paper_id',
  publishAt: 'publish_at',
  startTime: 'start_time',
  endTime: 'end_time',
  durationMinutes: 'duration_minutes',
  questionCount: 'question_count'
};

/** Chỉ cập nhật các trường có trong patch, và chỉ khi kỳ thi vẫn ở trạng thái mong đợi. */
export async function update(id: string, patch: UpdateExamBody, expectedStatus: string): Promise<ExamRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, expectedStatus];
  for (const key of Object.keys(UPDATABLE) as Array<keyof UpdateExamBody>) {
    if (patch[key] === undefined) continue;
    params.push(key === 'paperId' ? (patch.paperId ?? null) : patch[key]);
    sets.push(`${UPDATABLE[key]} = $${params.length}`);
  }
  if (!sets.length) return findById(id);
  return queryOne<ExamRow>(
    `UPDATE exams SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND status = $2 RETURNING ${EXAM_COLUMNS}`,
    params
  );
}

export async function remove(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM exams WHERE id = $1 AND status = 'draft' RETURNING id`, [id]);
  return rows.length > 0;
}

export async function markPublished(id: string): Promise<ExamRow | null> {
  return queryOne<ExamRow>(
    `UPDATE exams SET status = 'published', updated_at = now() WHERE id = $1 AND status = 'draft' RETURNING ${EXAM_COLUMNS}`,
    [id]
  );
}

export interface PaperStats {
  questionCount: number;
  incompleteCount: number;
}

export async function paperStats(paperId: string): Promise<PaperStats | null> {
  const exists = await queryOne('SELECT 1 FROM exam_papers WHERE id = $1', [paperId]);
  if (!exists) return null;
  const row = await queryOne<PaperStats>(
    `SELECT count(*)::int AS "questionCount",
            count(*) FILTER (WHERE points <= 0 OR cardinality(correct_option_ids) = 0
                             OR (type = 'multiple_choice' AND NOT (correct_option_ids <@ ARRAY(SELECT o->>'id' FROM jsonb_array_elements(options) o)))
                             OR (type = 'fill_blank' AND (jsonb_array_length(options) <> 0
                                 OR EXISTS (SELECT 1 FROM unnest(correct_option_ids) AS accepted(answer) WHERE length(btrim(accepted.answer)) = 0))))::int AS "incompleteCount"
     FROM exam_paper_questions WHERE paper_id = $1`,
    [paperId]
  );
  return row!;
}

export async function paperBelongsTo(paperId: string, ownerId?: string): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM exam_papers WHERE id = $1 AND ($2::uuid IS NULL OR owner_id = $2)', [paperId, ownerId ?? null])) !== null;
}

export interface AudienceMember {
  id: string;
  username: string;
  fullName: string;
}

export function listAudience(examId: string): Promise<AudienceMember[]> {
  return query<AudienceMember>(
    `SELECT u.id, u.username, u.full_name AS "fullName"
     FROM exam_audience a JOIN users u ON u.id = a.student_id
     WHERE a.exam_id = $1 ORDER BY u.username`,
    [examId]
  );
}

export async function countAudience(examId: string): Promise<number> {
  return (await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM exam_audience WHERE exam_id = $1', [examId]))?.n ?? 0;
}

/** Trả về các tài khoản sinh viên đang hoạt động khớp danh sách id/username. */
export function resolveStudents(ids: string[], usernames: string[]): Promise<AudienceMember[]> {
  return query<AudienceMember>(
    `SELECT id, username, full_name AS "fullName" FROM users
     WHERE role = 'student' AND is_active AND (id = ANY($1::uuid[]) OR lower(username) = ANY($2::text[]))`,
    [ids, usernames.map((u) => u.toLowerCase())]
  );
}

export function replaceAudience(examId: string, studentIds: string[]): Promise<void> {
  return withTransaction(async (tx) => {
    await query('DELETE FROM exam_audience WHERE exam_id = $1', [examId], tx);
    if (studentIds.length) {
      await query('INSERT INTO exam_audience (exam_id, student_id) SELECT $1, unnest($2::uuid[])', [examId, studentIds], tx);
    }
  });
}
