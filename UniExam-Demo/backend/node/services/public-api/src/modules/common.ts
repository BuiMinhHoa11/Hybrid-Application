import { z } from 'zod';

export const uuidParam = z.object({ id: z.string().uuid('Mã định danh không hợp lệ') });

/** Chuỗi tùy chọn: chuỗi rỗng coi như không có. */
export const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(200).optional()
);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;
