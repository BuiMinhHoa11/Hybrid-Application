import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@uniexam/contracts';

export interface TokenPayload {
  /** id người dùng */
  sub: string;
  role: Role;
  username: string;
  name: string;
}

export function signToken(payload: TokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'], algorithm: 'HS256' });
}

/** Ném lỗi nếu token sai chữ ký, hết hạn hoặc thiếu trường bắt buộc. */
export function verifyToken(token: string, secret: string): TokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') throw new Error('Token không hợp lệ');
  const { sub, role, username, name } = decoded as Partial<TokenPayload>;
  if (!sub || !username || !role || !ROLES.includes(role)) throw new Error('Token thiếu thông tin');
  return { sub, role, username, name: name ?? username };
}
