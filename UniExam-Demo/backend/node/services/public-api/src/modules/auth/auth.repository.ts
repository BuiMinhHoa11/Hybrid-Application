import { PUBLIC_USER_COLUMNS, USER_COLUMNS, queryOne, type PublicUser, type UserRow } from '@uniexam/db';

export function findByUsername(username: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE lower(username) = lower($1)`, [username]);
}

export function findPublicById(id: string): Promise<PublicUser | null> {
  return queryOne<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [id]);
}
