import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '../../shared/lib';

/**
 * Đồng hồ đếm ngược theo giờ server (offsetMs bù lệch đồng hồ máy).
 * Hết giờ gọi onExpire đúng một lần; việc khóa bài và tự nộp do server quyết định.
 */
export function CountdownTimer({ expiresAtMs, offsetMs, onExpire }: { expiresAtMs: number; offsetMs: number; onExpire: () => void }) {
  const remaining = () => expiresAtMs - (Date.now() + offsetMs);
  const [left, setLeft] = useState(remaining);
  const fired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const ms = expiresAtMs - (Date.now() + offsetMs);
      setLeft(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAtMs, offsetMs]);

  const tone = left <= 60_000 ? 'danger' : left <= 5 * 60_000 ? 'warn' : '';
  return (
    <div className={`timer ${tone}`} role="timer" aria-label="Thời gian còn lại">
      {formatCountdown(left)}
    </div>
  );
}
