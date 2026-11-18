import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Role } from '@uniexam/contracts';
import { forbidden, unauthorized } from '@uniexam/observability';
import { verifyToken } from './jwt';

export interface AuthUser {
  id: string;
  role: Role;
  username: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export interface AuthenticateOptions {
  secret: string;
  /**
   * Kiểm tra tài khoản còn hoạt động. Dùng để khóa tài khoản có hiệu lực ngay
   * cả khi JWT chưa hết hạn. Kết quả được nhớ trong thời gian ngắn.
   */
  isActive?: (userId: string) => Promise<boolean>;
  activeCacheMs?: number;
}

/** Xác thực JWT trong header Authorization: Bearer <token> và gắn req.user. */
export function createAuthenticate(options: AuthenticateOptions): RequestHandler {
  const cacheMs = options.activeCacheMs ?? 5000;
  const cache = new Map<string, { active: boolean; at: number }>();

  async function active(userId: string): Promise<boolean> {
    if (!options.isActive) return true;
    const hit = cache.get(userId);
    const now = Date.now();
    if (hit && now - hit.at < cacheMs) return hit.active;
    const value = await options.isActive(userId);
    cache.set(userId, { active: value, at: now });
    return value;
  }

  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      let payload;
      try {
        payload = verifyToken(header.slice(7).trim(), options.secret);
      } catch {
        throw unauthorized();
      }
      if (!(await active(payload.sub))) throw unauthorized('Tài khoản đã bị khóa hoặc không tồn tại');
      req.user = { id: payload.sub, role: payload.role, username: payload.username, name: payload.name };
      req.headers['x-user-id'] = payload.sub;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Chỉ cho phép các vai trò được liệt kê. Phải đứng sau authenticate. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** Xác thực lời gọi nội bộ giữa các dịch vụ bằng header x-internal-key. */
export function requireInternalKey(expected: string): RequestHandler {
  const expectedBuf = Buffer.from(expected);
  return (req, _res, next) => {
    const given = Buffer.from(String(req.headers['x-internal-key'] ?? ''));
    const ok = given.length === expectedBuf.length && timingSafeEqual(given, expectedBuf);
    if (!ok) return next(unauthorized('Khóa nội bộ không hợp lệ'));
    next();
  };
}
