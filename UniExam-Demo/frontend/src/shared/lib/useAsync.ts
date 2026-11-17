import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Chạy hàm bất đồng bộ khi deps đổi và theo dõi kết quả. Bỏ qua kết quả của lượt gọi cũ,
 * nên đổi bộ lọc nhanh không bị kết quả chậm của lượt trước ghi đè.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    setLoading(true);
    fn().then(
      (value) => {
        if (id !== latest.current) return;
        setData(value);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (id !== latest.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
