import { tokenStore } from '../auth/token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const AUTH_EXPIRED_EVENT = 'uniexam:auth-expired';

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function buildUrl(base: string, path: string, query?: Query): string {
  const url = `${base}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Client JSON cho một dịch vụ backend (basePath: /api hoặc /exam-api).
 * Tự gắn JWT vào Authorization; khi gặp 401 thì xóa phiên đăng nhập và báo cho ứng dụng.
 */
export function createClient(basePath: string) {
  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(buildUrl(basePath, path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError(0, 'Không kết nối được máy chủ, vui lòng kiểm tra mạng', 'NETWORK');
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = undefined;
    }

    if (!res.ok) {
      const err = (payload as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
      if (res.status === 401 && token && path !== '/auth/login') {
        tokenStore.clear();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      throw new ApiError(res.status, err?.message ?? `Lỗi ${res.status}`, err?.code, err?.details);
    }
    return payload as T;
  }

  return {
    get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
    delete: <T>(path: string) => request<T>('DELETE', path)
  };
}

/** public-api: đăng nhập, CRUD, xem kết quả. */
export const publicApi = createClient('/api');
/** private-api: phiên làm bài, lưu đáp án, nộp bài. */
export const examApi = createClient('/exam-api');
