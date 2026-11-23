import { useEffect } from 'react';
import { listSealedSessions, readSealed, sendSealed } from './offlineSubmission';

const RETRY_MS = 15_000;

/**
 * Chạy ở các trang của sinh viên: còn bài nộp ngoại tuyến nào chưa gửi được (kể cả từ lần mở trước,
 * hoặc phải đăng nhập lại) thì tự gửi khi có mạng, thử lại định kỳ cho tới khi xong.
 */
export function useOfflineSubmissionSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      clearTimeout(timer);
      for (const id of listSealedSessions()) {
        if (stopped) return;
        await sendSealed(id);
      }
      const waiting = listSealedSessions().some((id) => !readSealed(id)?.failedMessage);
      if (!stopped && waiting) timer = setTimeout(() => void run(), RETRY_MS);
    };
    const online = () => void run();
    void run();
    window.addEventListener('online', online);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', online);
    };
  }, [enabled]);
}
