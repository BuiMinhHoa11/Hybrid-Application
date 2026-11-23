import { createAuthenticate } from '@uniexam/auth';
import { getConfig } from '@uniexam/config';
import { queryOne } from '@uniexam/db';

/** Dùng chung JWT_SECRET với public-api; kiểm tra tài khoản còn hoạt động để khóa có hiệu lực ngay. */
export const authenticate = createAuthenticate({
  secret: getConfig().jwtSecret,
  isActive: async (userId) => (await queryOne('SELECT 1 FROM users WHERE id = $1 AND is_active', [userId])) !== null
});
