import type { Role } from '@uniexam/contracts';

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Danh sách cột dùng trong SELECT, đặt bí danh camelCase khớp UserRow. */
export const USER_COLUMNS = `
  id, username, full_name AS "fullName", email, password_hash AS "passwordHash", role,
  is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Cột an toàn để trả ra ngoài (không có passwordHash). */
export type PublicUser = Omit<UserRow, 'passwordHash'>;
export const PUBLIC_USER_COLUMNS = `
  id, username, full_name AS "fullName", email, role,
  is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;
