import { ApiError } from '../../shared/api';
import type { FullscreenEvent } from '../../entities/submission/types';

export async function enterExamFullscreen(): Promise<void> {
  if (document.fullscreenElement === document.documentElement) return;
  if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
    throw new Error('Trình duyệt chưa hỗ trợ toàn màn hình. Hãy dùng Chrome, Edge hoặc Firefox trên máy tính.');
  }
  try { await document.documentElement.requestFullscreen(); }
  catch { throw new Error('Chưa vào được toàn màn hình. Hãy cho phép toàn màn hình và bấm lại để tiếp tục.'); }
}

/** Durable browser outbox. Event UUIDs make retry/reload safe on the server. */
export class FullscreenLog {
  private pending: FullscreenEvent[] = [];
  private running: Promise<void> | undefined;
  private key: string;

  constructor(sessionId: string, private storage: Storage | null,
    private send: (event: FullscreenEvent) => Promise<unknown>, private onError: (message?: string) => void) {
    this.key = `uniexam.fullscreen-events.${sessionId}`;
    try {
      const stored: unknown = JSON.parse(storage?.getItem(this.key) ?? '[]');
      if (Array.isArray(stored)) this.pending = stored.filter((e): e is FullscreenEvent =>
        !!e && typeof e.id === 'string' && /^[0-9a-f-]{36}$/i.test(e.id)
        && ['fullscreen_enter', 'fullscreen_exit'].includes(e.type)
        && typeof e.clientTime === 'string' && Number.isFinite(Date.parse(e.clientTime))).slice(0, 2000);
    } catch { /* A corrupt/unavailable storage must not prevent API delivery. */ }
  }

  record(type: FullscreenEvent['type'], clientTime: string) {
    this.pending.push({ id: crypto.randomUUID(), type, clientTime });
    this.persist();
    void this.flush();
  }

  private persist() {
    try {
      if (!this.storage) throw new Error('storage unavailable');
      if (this.pending.length) this.storage.setItem(this.key, JSON.stringify(this.pending));
      else this.storage.removeItem(this.key);
    } catch { this.onError('Nhật ký chưa lưu được trên máy. Hãy giữ trang mở và kết nối mạng để đồng bộ.'); }
  }

  flush(): Promise<void> {
    this.running ??= this.deliver().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async deliver() {
    while (this.pending.length) {
      const event = this.pending[0];
      try { await this.send(event); }
      catch (error) {
        if (error instanceof ApiError && [409, 422].includes(error.status)) {
          this.pending.shift();
          this.persist();
          this.onError('Có sự kiện ngoài thời gian thi không được máy chủ chấp nhận.');
          continue;
        }
        this.onError('Nhật ký đang chờ đồng bộ. Hệ thống sẽ thử lại khi kết nối và tài khoản hợp lệ.');
        return;
      }
      this.pending.shift();
      this.persist();
      this.onError(undefined);
    }
  }
}
