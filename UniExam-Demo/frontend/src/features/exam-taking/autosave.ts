import { ApiError } from '../../shared/api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AnswerPatch {
  selectedOptionIds?: string[];
  flagged?: boolean;
}

export interface AutosaverOptions {
  save: (questionId: string, patch: AnswerPatch) => Promise<unknown>;
  onStatus: (status: SaveStatus) => void;
  /** Server báo phiên đã khóa (đã nộp hoặc hết giờ). */
  onLocked: () => void;
  debounceMs?: number;
  retryBaseMs?: number;
}

const MAX_RETRY_MS = 15_000;

/** Lỗi do server từ chối hẳn (sai dữ liệu, không có quyền): gửi lại cũng vô ích. */
function isPermanent(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

function isLocked(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && (err.code === 'SESSION_LOCKED' || err.code === 'TIME_UP');
}

/**
 * UC01B: tự lưu đáp án sau mỗi lần chọn hoặc đánh dấu.
 * - Gộp nhiều thay đổi liên tiếp của cùng một câu (debounce) và gửi lần lượt để giữ đúng thứ tự.
 * - Mất mạng hoặc lỗi 5xx: giữ nguyên thay đổi và thử lại với thời gian chờ tăng dần.
 * - Server báo đã khóa phiên: dừng hẳn và báo cho giao diện.
 */
export class Autosaver {
  private pending = new Map<string, AnswerPatch>();
  private rejected = new Map<string, AnswerPatch>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private failures = 0;
  private locked = false;

  constructor(private readonly o: AutosaverOptions) {}

  get hasPending(): boolean {
    return this.pending.size > 0 || this.rejected.size > 0;
  }

  enqueue(questionId: string, patch: AnswerPatch): void {
    if (this.locked) return;
    this.pending.set(questionId, { ...this.rejected.get(questionId), ...this.pending.get(questionId), ...patch });
    this.rejected.delete(questionId);
    this.o.onStatus('saving');
    this.schedule(this.o.debounceMs ?? 300);
  }

  /**
   * Gửi ngay mọi thay đổi còn chờ. Trả về true khi không còn gì chưa lưu
   * (dùng trước khi nộp bài để chắc chắn đáp án mới nhất đã lên server).
   */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    await this.run();
    return !this.hasPending;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.pending.clear();
    this.rejected.clear();
    this.locked = true;
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private run(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.pending.size > 0 && !this.locked) {
      const [questionId, patch] = this.pending.entries().next().value as [string, AnswerPatch];
      this.pending.delete(questionId);
      try {
        await this.o.save(questionId, patch);
        if (this.locked) return;
        this.failures = 0;
      } catch (err) {
        if (this.locked) return;
        if (isLocked(err)) {
          this.locked = true;
          this.pending.clear();
          this.rejected.clear();
          this.o.onLocked();
          return;
        }
        if (isPermanent(err)) {
          // Không thử lại dữ liệu bị từ chối, nhưng giữ lỗi để chặn nộp bài
          // đến khi sinh viên sửa và lưu được câu trả lời này.
          if (this.pending.has(questionId)) {
            this.pending.set(questionId, { ...patch, ...this.pending.get(questionId) });
          } else {
            this.rejected.set(questionId, patch);
          }
          this.o.onStatus('error');
          continue;
        }
        // Giữ lại thay đổi; nếu trong lúc chờ người dùng đã đổi tiếp thì thay đổi mới hơn được ưu tiên.
        this.pending.set(questionId, { ...patch, ...this.pending.get(questionId) });
        this.failures += 1;
        this.o.onStatus('error');
        this.schedule(Math.min((this.o.retryBaseMs ?? 1000) * 2 ** (this.failures - 1), MAX_RETRY_MS));
        return;
      }
    }
    if (!this.locked) this.o.onStatus(this.rejected.size ? 'error' : this.pending.size ? 'saving' : 'saved');
  }
}
