import { createAuthenticate } from '@uniexam/auth';
import { getConfig } from '@uniexam/config';
import { queryOne } from '@uniexam/db';

/** Xác thực JWT và chặn ngay tài khoản đã bị khóa (kiểm tra DB, có nhớ đệm ngắn). */
export const authenticate = createAuthenticate({
  secret: getConfig().jwtSecret,
  isActive: async (userId) => (await queryOne('SELECT 1 FROM users WHERE id = $1 AND is_active', [userId])) !== null
});
