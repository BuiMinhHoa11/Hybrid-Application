import { hashPassword, signToken, verifyPassword } from '@uniexam/auth';
import { getConfig } from '@uniexam/config';
import { forbidden, notFound, unauthorized } from '@uniexam/observability';
import type { PublicUser } from '@uniexam/db';
import type { LoginDto } from './auth.dto';
import * as repo from './auth.repository';

// Luôn so sánh mật khẩu kể cả khi không có tài khoản, để thời gian phản hồi không lộ username tồn tại.
const dummyHash = hashPassword('uniexam-dummy-password');

export interface LoginResult {
  token: string;
  user: Pick<PublicUser, 'id' | 'username' | 'fullName' | 'role'>;
}

export async function login(dto: LoginDto): Promise<LoginResult> {
  const user = await repo.findByUsername(dto.username);
  const ok = await verifyPassword(dto.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) throw unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  if (!user.isActive) throw forbidden('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');

  const cfg = getConfig();
  const token = signToken(
    { sub: user.id, role: user.role, username: user.username, name: user.fullName },
    cfg.jwtSecret,
    cfg.jwtExpiresIn
  );
  return { token, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await repo.findPublicById(userId);
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}
