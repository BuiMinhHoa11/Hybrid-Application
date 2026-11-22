import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { isAbortError, withAbortSignal } from '../api/http';
import { tokenStore } from '../auth/token';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Bộ nhớ đệm trong trình duyệt cho kết quả của useAsync, theo từng nơi gọi + tham số + người đăng nhập.
 * Mở lại một trang đã xem thì hiện ngay dữ liệu lần trước, đồng thời tải bản mới ở nền.
 */
const cache = new Map<string, unknown>();
const MAX_CACHE_ENTRIES = 100;

function cacheKey(name: string | undefined, deps: DependencyList): string | null {
  if (!name) return null; // không đặt tên thì không dùng bộ đệm
  try {
    return `${tokenStore.get() ?? ''}|${name}|${JSON.stringify(deps)}`;
  } catch {
    return null; // deps không chuyển được sang chuỗi: bỏ qua bộ đệm
  }
}

function remember(key: string | null, value: unknown): void {
  if (key === null) return;
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/** Xóa toàn bộ dữ liệu đệm, ví dụ khi đăng xuất. */
export function clearAsyncCache(): void {
  cache.clear();
}

/**
 * Chạy hàm bất đồng bộ khi deps đổi và theo dõi kết quả.
 * - cacheName (tùy chọn, duy nhất cho mỗi loại dữ liệu): có dữ liệu đệm của lần trước thì hiện ngay,
 *   rồi tải lại ở nền (stale-while-revalidate). Không truyền thì không dùng bộ đệm.
 * - Rời trang hoặc deps đổi thì hủy request GET đang chạy, để request không xếp hàng ở server.
 * - Bỏ qua kết quả của lượt gọi cũ, nên đổi bộ lọc nhanh không bị kết quả chậm của lượt trước ghi đè.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, cacheName?: string): AsyncState<T> {
  const key = cacheKey(cacheName, deps);
  const [data, setData] = useState<T | undefined>(() => (key === null ? undefined : (cache.get(key) as T | undefined)));
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    const controller = new AbortController();
    if (key !== null && cache.has(key)) setData(cache.get(key) as T);
    setLoading(true);
    let promise: Promise<T>;
    try {
      promise = withAbortSignal(controller.signal, fn);
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.then(
      (value) => {
        if (controller.signal.aborted || id !== latest.current) return;
        remember(key, value);
        setData(value);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbortError(err) || id !== latest.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
