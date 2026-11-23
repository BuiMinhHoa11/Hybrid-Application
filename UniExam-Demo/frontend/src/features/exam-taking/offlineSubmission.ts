import { sessionApi } from '../../entities/submission/api';
import type { OfflineSubmission } from '../../entities/submission/types';
import { ApiError } from '../../shared/api';

/**
 * Bài nộp ngoại tuyến: sinh viên mất mạng vẫn làm hết bài. Khi bấm Nộp hoặc hết giờ mà chưa gửi được,
 * toàn bộ bài làm được khóa và giữ trong localStorage, rồi tự gửi lên server khi có mạng lại
 * (server nhận trong một khoảng thời gian sau giờ hết hạn, xem OFFLINE_SUBMIT_GRACE_MINUTES).
 */
const PREFIX = 'uniexam.sealed.';
/** Đánh dấu bài đã được máy chủ dự phòng (S3) giữ tạm, chờ chuyển về hệ thống chính. */
const BUFFERED_PREFIX = 'uniexam.buffered.';

export interface SealedRecord extends OfflineSubmission {
  /** Tên kỳ thi, để hiện màn hình chờ gửi bài khi mở lại trang lúc vẫn mất mạng. */
  examTitle?: string;
  /** Server từ chối hẳn (ví dụ đã công bố kết quả, quá hạn): dừng gửi lại và hiện lý do. */
  failedMessage?: string;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readSealed(sessionId: string): SealedRecord | null {
  try {
    const raw = storage()?.getItem(PREFIX + sessionId);
    const parsed = raw ? (JSON.parse(raw) as SealedRecord) : null;
    return parsed && Array.isArray(parsed.answers) && typeof parsed.sealedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Trả về false nếu không ghi được (localStorage bị chặn hoặc đầy). */
export function writeSealed(sessionId: string, record: SealedRecord): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(PREFIX + sessionId, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Xóa bài đã khóa cùng các bản sao làm bài khác của phiên (đề, đáp án chưa gửi). */
export function clearSealed(sessionId: string): void {
  const store = storage();
  for (const key of [PREFIX + sessionId, `uniexam.room.${sessionId}`, `uniexam.pending.${sessionId}`]) {
    try {
      store?.removeItem(key);
    } catch {
      /* bỏ qua */
    }
  }
}

/** Lúc bài được máy chủ dự phòng nhận (ISO), hoặc null. */
export function readBuffered(sessionId: string): string | null {
  try {
    return storage()?.getItem(BUFFERED_PREFIX + sessionId) ?? null;
  } catch {
    return null;
  }
}

export function clearBuffered(sessionId: string): void {
  try {
    storage()?.removeItem(BUFFERED_PREFIX + sessionId);
  } catch {
    /* bỏ qua */
  }
}

export function listSealedSessions(): string[] {
  const store = storage();
  if (!store) return [];
  const ids: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) ids.push(key.slice(PREFIX.length));
  }
  return ids;
}

/** buffered: hệ thống chính đang sập, bài đã được giữ tạm an toàn trên máy chủ dự phòng. */
export type SendResult = 'sent' | 'buffered' | 'retry' | 'failed';

const inFlight = new Map<string, Promise<SendResult>>();

/**
 * Gửi bài đã khóa của một phiên. Mỗi phiên chỉ có một lần gửi chạy cùng lúc.
 * fallback: bản trong bộ nhớ, dùng khi trình duyệt chặn localStorage.
 */
export function sendSealed(sessionId: string, fallback?: SealedRecord | null): Promise<SendResult> {
  const running = inFlight.get(sessionId);
  if (running) return running;
  const task = (async (): Promise<SendResult> => {
    const record = readSealed(sessionId) ?? fallback ?? null;
    if (!record) return 'sent';
    if (record.failedMessage) return 'failed';
    try {
      const { answers, sealedAt, offlineSeconds } = record;
      const response = await sessionApi.offlineSubmit(sessionId, { answers, sealedAt, offlineSeconds });
      clearSealed(sessionId);
      if (response?.buffered) {
        try {
          storage()?.setItem(BUFFERED_PREFIX + sessionId, new Date().toISOString());
        } catch {
          /* bỏ qua: bài đã an toàn trên máy chủ dự phòng */
        }
        return 'buffered';
      }
      return 'sent';
    } catch (err) {
      // Chỉ dừng hẳn khi server từ chối nội dung bài (409: đã công bố kết quả, quá hạn; 422: dữ liệu sai).
      // Còn lại (mất mạng, server lỗi tạm thời, hết phiên đăng nhập, máy đang đăng nhập tài khoản khác): thử lại sau.
      if (!(err instanceof ApiError) || (err.status !== 409 && err.status !== 422)) return 'retry';
      writeSealed(sessionId, { ...record, failedMessage: err.message });
      return 'failed';
    }
  })().finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, task);
  return task;
}
