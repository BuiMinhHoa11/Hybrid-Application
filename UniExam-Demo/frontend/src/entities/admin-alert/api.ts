import { AUTH_EXPIRED_EVENT, publicApi } from '../../shared/api';
import { tokenStore } from '../../shared/auth/token';
import type { AdminAlertSnapshot } from './types';

export const adminAlertApi = {
  read: (id: string) => publicApi.post<AdminAlertSnapshot>(`/admin/exam-alerts/${id}/read`),
  readAll: (throughId: string) => publicApi.post<AdminAlertSnapshot>('/admin/exam-alerts/read-all', { throughId })
};

export type AlertConnection = 'connecting' | 'connected' | 'reconnecting' | 'forbidden';

function expire(token: string) {
  if (tokenStore.get() !== token) return;
  tokenStore.clear();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** Fetch-based SSE keeps the JWT in a header and reconnects to durable unread state. */
export async function watchAdminAlerts(signal: AbortSignal, onSnapshot: (snapshot: AdminAlertSnapshot) => void,
  onConnection: (state: AlertConnection) => void): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    const token = tokenStore.get();
    if (!token) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let lastPacket = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastPacket > 45000) controller.abort();
    }, 5000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch('/api/admin/exam-alerts/stream', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal, cache: 'no-store'
      });
      if (response.status === 401 || response.status === 403) {
        if (response.status === 401) expire(token);
        if (!signal.aborted) onConnection('forbidden');
        return;
      }
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('Alert stream unavailable');
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Alert stream closed');
        lastPacket = Date.now();
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        if (buffer.length > 2_000_000) throw new Error('Invalid alert stream');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const packet = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const lines = packet.split('\n');
          const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
          if (event === 'auth-expired') { expire(token); return; }
          if (event === 'unavailable') throw new Error('Alert service unavailable');
          if (event !== 'alerts') continue;
          const snapshot = JSON.parse(lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')) as AdminAlertSnapshot;
          if (!Array.isArray(snapshot.items) || !Array.isArray(snapshot.activeSessions) || typeof snapshot.unreadCount !== 'number' || typeof snapshot.latestId !== 'string') {
            throw new Error('Invalid alert data');
          }
          if (signal.aborted || tokenStore.get() !== token) return;
          failures = 0;
          onConnection('connected');
          onSnapshot(snapshot);
        }
      }
    } catch {
      if (signal.aborted) return;
      onConnection('reconnecting');
    } finally {
      clearInterval(watchdog);
      signal.removeEventListener('abort', abort);
      controller.abort();
      reader?.releaseLock();
    }
    await pause(Math.min(1000 * 2 ** failures++, 10000), signal);
  }
}
