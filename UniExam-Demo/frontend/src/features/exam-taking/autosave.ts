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
  /**
   * Khóa localStorage để giữ các thay đổi chưa gửi được (mất mạng, server sập, lỡ tải lại trang).
   * Mở lại trang thì tự gửi tiếp. Bỏ trống thì chỉ giữ trong bộ nhớ như trước.
   */
  storageKey?: string;
}

type PatchMap = Record<string, AnswerPatch>;

/** Đọc các thay đổi chưa lưu lên server đã được giữ trên máy (dùng để hiện lại đáp án khi tải lại trang). */
export function loadPersistedPatches(storageKey: string): PatchMap {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as PatchMap) : {};
  } catch {
    return {};
  }
}

export function clearPersistedPatches(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* localStorage bị chặn: không có gì để xóa */
  }
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
  /** Thay đổi đang được gửi; vẫn giữ trên máy cho tới khi server xác nhận. */
  private inFlight: [string, AnswerPatch] | null = null;

  constructor(private readonly o: AutosaverOptions) {
    this.restore();
  }

  /** Nạp lại thay đổi chưa gửi từ lần mở trang trước và gửi tiếp. */
  private restore(): void {
    if (!this.o.storageKey) return;
    const saved = loadPersistedPatches(this.o.storageKey);
    const ids = Object.keys(saved);
    if (!ids.length) return;
    for (const id of ids) this.pending.set(id, saved[id]);
    this.o.onStatus('saving');
    this.schedule(0);
  }

  /** Ghi các thay đổi chưa được server xác nhận xuống localStorage. */
  private persist(): void {
    if (!this.o.storageKey) return;
    const all: PatchMap = {};
    for (const [id, patch] of this.rejected) all[id] = patch;
    if (this.inFlight) all[this.inFlight[0]] = { ...all[this.inFlight[0]], ...this.inFlight[1] };
    for (const [id, patch] of this.pending) all[id] = { ...all[id], ...patch };
    try {
      if (Object.keys(all).length) localStorage.setItem(this.o.storageKey, JSON.stringify(all));
      else localStorage.removeItem(this.o.storageKey);
    } catch {
      /* localStorage đầy hoặc bị chặn: vẫn giữ trong bộ nhớ và thử gửi lại */
    }
  }

  get hasPending(): boolean {
    return this.pending.size > 0 || this.rejected.size > 0;
  }

  enqueue(questionId: string, patch: AnswerPatch): void {
    if (this.locked) return;
    this.pending.set(questionId, { ...this.rejected.get(questionId), ...this.pending.get(questionId), ...patch });
    this.rejected.delete(questionId);
    this.persist();
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

  /** Ngừng bộ lưu khi rời trang. Thay đổi chưa gửi vẫn nằm trên máy để lần mở sau gửi tiếp. */
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
      this.inFlight = [questionId, patch];
      try {
        await this.o.save(questionId, patch);
        this.inFlight = null;
        this.persist();
        if (this.locked) return;
        this.failures = 0;
      } catch (err) {
        this.inFlight = null;
        if (this.locked) return;
        if (isLocked(err)) {
          // Phiên đã nộp hoặc hết giờ: thay đổi giữ trên máy không còn dùng được.
          this.locked = true;
          this.pending.clear();
          this.rejected.clear();
          if (this.o.storageKey) clearPersistedPatches(this.o.storageKey);
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
          this.persist();
          this.o.onStatus('error');
          continue;
        }
        // Giữ lại thay đổi; nếu trong lúc chờ người dùng đã đổi tiếp thì thay đổi mới hơn được ưu tiên.
        this.pending.set(questionId, { ...patch, ...this.pending.get(questionId) });
        this.persist();
        this.failures += 1;
        this.o.onStatus('error');
        this.schedule(Math.min((this.o.retryBaseMs ?? 1000) * 2 ** (this.failures - 1), MAX_RETRY_MS));
        return;
      }
    }
    if (!this.locked) this.o.onStatus(this.rejected.size ? 'error' : this.pending.size ? 'saving' : 'saved');
  }
}
