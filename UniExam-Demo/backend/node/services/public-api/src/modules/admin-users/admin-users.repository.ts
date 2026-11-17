import { PUBLIC_USER_COLUMNS, query, queryOne, type PublicUser } from '@uniexam/db';
import type { Role } from '@uniexam/contracts';
import type { ListUsersQuery } from './admin-users.dto';

export async function list(q: ListUsersQuery): Promise<{ items: PublicUser[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.role) {
    params.push(q.role);
    where.push(`role = $${params.length}`);
  }
  if (q.active) {
    params.push(q.active === 'true');
    where.push(`is_active = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const i = params.length;
    where.push(`(username ILIKE $${i} ESCAPE '\\' OR full_name ILIKE $${i} ESCAPE '\\' OR email ILIKE $${i} ESCAPE '\\')`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users ${clause}`, params);
  const items = await query<PublicUser>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users ${clause}
     ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );
  return { items, total: total?.n ?? 0 };
}

export interface UserDetail extends PublicUser {
  stats: { questions: number; exams: number; sessions: number };
}

export function findDetail(id: string): Promise<UserDetail | null> {
  return queryOne<UserDetail>(
    `SELECT ${PUBLIC_USER_COLUMNS},
            json_build_object(
              'questions', (SELECT count(*)::int FROM questions WHERE owner_id = users.id),
              'exams', (SELECT count(*)::int FROM exams WHERE owner_id = users.id),
              'sessions', (SELECT count(*)::int FROM exam_sessions WHERE student_id = users.id)
            ) AS stats
     FROM users WHERE id = $1`,
    [id]
  );
}

export function findPublic(id: string): Promise<PublicUser | null> {
  return queryOne<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [id]);
}

export async function insert(u: {
  username: string;
  fullName: string;
  email: string | null;
  role: Role;
  passwordHash: string;
}): Promise<PublicUser> {
  const row = await queryOne<PublicUser>(
    `INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [u.username, u.fullName, u.email, u.passwordHash, u.role]
  );
  return row!;
}

export function update(
  id: string,
  patch: { fullName?: string; email?: string | null; role?: Role; passwordHash?: string }
): Promise<PublicUser | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.fullName !== undefined) set('full_name', patch.fullName);
  if (patch.email !== undefined) set('email', patch.email);
  if (patch.role !== undefined) set('role', patch.role);
  if (patch.passwordHash !== undefined) set('password_hash', patch.passwordHash);
  if (!sets.length) return findPublic(id);
  return queryOne<PublicUser>(
    `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_USER_COLUMNS}`,
    params
  );
}

export function setActive(id: string, active: boolean): Promise<PublicUser | null> {
  return queryOne<PublicUser>(
    `UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_USER_COLUMNS}`,
    [id, active]
  );
}
