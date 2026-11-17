import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from './logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Chưa đăng nhập hoặc phiên đã hết hạn') => new HttpError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Không tìm thấy dữ liệu') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) => new HttpError(409, message, code, details);
export const unprocessable = (message: string, details?: unknown) => new HttpError(422, message, 'UNPROCESSABLE', details);

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Bọc controller async để lỗi đi vào error middleware. */
export const asyncHandler =
  (fn: AsyncRoute): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Không có đường dẫn ${req.method} ${req.path}` } });
};

interface ZodLikeError {
  name: string;
  issues: Array<{ path: Array<string | number>; message: string }>;
}

function isZodError(err: unknown): err is ZodLikeError {
  return typeof err === 'object' && err !== null && (err as ZodLikeError).name === 'ZodError';
}

/** Chuyển mọi lỗi thành JSON thống nhất { error: { code, message, details } }. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code ?? 'ERROR', message: err.message, details: err.details } });
    }
    if (isZodError(err)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu gửi lên không hợp lệ',
          details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        }
      });
    }
    const e = err as { type?: string; code?: string };
    if (e?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Nội dung JSON không hợp lệ' } });
    }
    if (e?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' } });
    }
    if (e?.code === '23505') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại' } });
    }
    if (e?.code === '23503') {
      return res.status(409).json({ error: { code: 'IN_USE', message: 'Dữ liệu đang được tham chiếu bởi dữ liệu khác' } });
    }
    if (e?.code === '22P02') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Giá trị định danh không hợp lệ' } });
    }
    logger.error('Lỗi không xử lý được', {
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại sau' } });
  };
}

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      logger.info('request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Date.now() - started,
        user: req.headers['x-user-id'] ?? undefined
      });
    });
    next();
  };
}
