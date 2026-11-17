import { useEffect, useState } from 'react';

/** Thời gian hiện tại theo giờ server (offsetMs = serverTime - Date.now()), cập nhật định kỳ. */
export function useNow(offsetMs: number, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const id = setInterval(() => setNow(Date.now() + offsetMs), everyMs);
    return () => clearInterval(id);
  }, [offsetMs, everyMs]);
  return now;
}
