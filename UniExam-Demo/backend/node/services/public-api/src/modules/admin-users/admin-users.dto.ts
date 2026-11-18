import { z } from 'zod';
import { ROLES } from '@uniexam/contracts';
import { optionalText, pagination } from '../common';

const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,50}$/, 'Tên đăng nhập 3-50 ký tự gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang');
const password = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100);
const email = z.preprocess((v) => (v === '' ? null : v), z.string().trim().email('Email không hợp lệ').max(200).nullable());

export const createUserBody = z.object({
  username,
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(100),
  email: email.optional(),
  role: z.enum(ROLES),
  password
});
export type CreateUserBody = z.infer<typeof createUserBody>;

export const updateUserBody = z
  .object({
    fullName: z.string().trim().min(1, 'Nhập họ tên').max(100),
    email,
    role: z.enum(ROLES),
    /** Đặt lại mật khẩu (tùy chọn) */
    password
  })
  .partial();
export type UpdateUserBody = z.infer<typeof updateUserBody>;

export const listUsersQuery = z.object({
  q: optionalText,
  role: z.preprocess((v) => (v === '' ? undefined : v), z.enum(ROLES).optional()),
  active: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  ...pagination
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
