import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionApi } from '../../entities/submission/api';
import type { SavedAnswer, SessionPayload, SubmitResult } from '../../entities/submission/types';
import { Autosaver, clearPersistedPatches, loadPersistedPatches, type SaveStatus } from './autosave';
import { ApiError } from '../../shared/api';

const EMPTY: SavedAnswer = { selectedOptionIds: [], flagged: false };

/** Khóa localStorage: thay đổi chưa gửi được, và bản sao đề để mở lại khi mất kết nối. */
const pendingKey = (sessionId: string) => `uniexam.pending.${sessionId}`;
const roomKey = (sessionId: string) => `uniexam.room.${sessionId}`;

interface CachedRoom {
  data: SessionPayload;
  /** Date.now() lúc lưu, để tính lại độ lệch đồng hồ so với server khi dùng bản sao. */
  cachedAt: number;
}

/** Lỗi do mất mạng hoặc server không trả lời (502/503/504...), khác với lỗi bị từ chối. */
function isConnectionError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500);
}

function saveRoom(sessionId: string, data: SessionPayload): void {
  const write = (payload: SessionPayload) =>
    localStorage.setItem(roomKey(sessionId), JSON.stringify({ data: payload, cachedAt: Date.now() } satisfies CachedRoom));
  try {
    write(data);
  } catch {
    // Đề có ảnh lớn có thể vượt giới hạn localStorage: lưu bản không ảnh.
    try {
      write({ ...data, questions: data.questions.map((q) => ({ ...q, imageDataUrl: null })) });
    } catch {
      /* localStorage bị chặn hoặc vẫn quá lớn */
    }
  }
}

function readRoom(sessionId: string): CachedRoom | null {
  try {
    const raw = localStorage.getItem(roomKey(sessionId));
    return raw ? (JSON.parse(raw) as CachedRoom) : null;
  } catch {
    return null;
  }
}

function forgetRoom(sessionId: string): void {
  try {
    localStorage.removeItem(roomKey(sessionId));
  } catch {
    /* bỏ qua */
  }
  clearPersistedPatches(pendingKey(sessionId));
}

/**
 * Trạng thái của một phiên làm bài: tải đề, giữ đáp án cục bộ, tự lưu, đồng hồ theo giờ server, nộp bài.
 * Đáp án luôn cập nhật ngay trên giao diện; việc lưu lên server chạy nền qua Autosaver.
 */
export function useExamSession(sessionId: string) {
  const [payload, setPayload] = useState<SessionPayload>();
  const [answers, setAnswers] = useState<Record<string, SavedAnswer>>({});
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [expired, setExpired] = useState(false);
  const [expiryError, setExpiryError] = useState<Error>();
  /** true khi đang hiển thị bản sao đề trên máy vì không kết nối được server. */
  const [offline, setOffline] = useState(false);
  /** serverTime - Date.now() tại lúc tải: bù lệch đồng hồ giữa máy sinh viên và server. */
  const [offsetMs, setOffsetMs] = useState(0);
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const localEdits = useRef<Record<string, Partial<SavedAnswer>>>({});

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    let data: SessionPayload;
    let fromCache = false;
    let offset: number;
    try {
      data = await sessionApi.get(sessionId);
      offset = Date.parse(data.serverTime) - Date.now();
    } catch (err) {
      // Mất mạng hoặc server private không trả lời: mở lại đề từ bản sao trên máy (nếu có),
      // để sinh viên làm tiếp; đáp án được giữ trên máy và tự gửi khi kết nối lại.
      const cached = isConnectionError(err) ? readRoom(sessionId) : null;
      if (!cached || cached.data.session.status !== 'in_progress') throw err;
      data = cached.data;
      fromCache = true;
      offset = Date.parse(cached.data.serverTime) - cached.cachedAt;
    }
    // Chỉ request mới nhất của lần mount hiện tại được cập nhật giao diện.
    // Cleanup cũng vô hiệu hóa request cũ của StrictMode dù sessionId không đổi.
    if (!mounted.current || generation !== loadGeneration.current || activeSession.current !== sessionId) return data;
    setOffline(fromCache);
    setPayload(data);
    if (data.session.status === 'in_progress') {
      if (!fromCache) saveRoom(sessionId, data);
      const merged = { ...data.answers };
      // Một GET có thể chụp dữ liệu trước autosave. Giữ các trường sinh viên vừa sửa
      // (kể cả thay đổi chưa gửi được còn giữ trên máy) để không bị dữ liệu cũ ghi đè.
      const unsent = { ...loadPersistedPatches(pendingKey(sessionId)), ...localEdits.current };
      for (const [questionId, patch] of Object.entries(unsent)) {
        merged[questionId] = { ...(merged[questionId] ?? EMPTY), ...patch } as SavedAnswer;
      }
      setAnswers(merged);
    } else {
      localEdits.current = {};
      forgetRoom(sessionId);
      setAnswers(data.answers);
    }
    setOffsetMs(offset);
    return data;
  }, [sessionId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const saver = useRef<Autosaver | null>(null);

  useEffect(() => {
    // Tạo bộ lưu trong effect để mỗi lần mount (kể cả StrictMode) có bộ lưu còn hoạt động.
    const activeSaver = new Autosaver({
      save: (questionId, patch) => sessionApi.saveAnswer(sessionId, questionId, patch),
      onStatus: setSaveStatus,
      storageKey: pendingKey(sessionId),
      // Server báo đã khóa: tải lại để hiển thị trạng thái đã nộp/hết giờ.
      onLocked: () => void loadRef.current().catch(() => undefined)
    });
    saver.current = activeSaver;
    return () => {
      activeSaver.dispose();
      if (saver.current === activeSaver) saver.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    localEdits.current = {};
    setLoading(true);
    setPayload(undefined);
    setAnswers({});
    setError(undefined);
    setSaveStatus('idle');
    setExpired(false);
    setExpiryError(undefined);
    setOffline(false);
    load()
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, [load]);

  // Có mạng trở lại: gửi ngay các đáp án đang chờ và tải lại đề từ server nếu đang dùng bản sao.
  useEffect(() => {
    const reconnect = () => {
      void saver.current?.flush().catch(() => undefined);
      if (offline) void loadRef.current().catch(() => undefined);
    };
    window.addEventListener('online', reconnect);
    // Khi đang dùng bản sao, thử kết nối lại định kỳ (server có thể sống lại mà mạng máy không đổi).
    const timer = offline ? setInterval(reconnect, 15_000) : undefined;
    return () => {
      window.removeEventListener('online', reconnect);
      clearInterval(timer);
    };
  }, [offline]);

  const answerOf = useCallback((questionId: string): SavedAnswer => answers[questionId] ?? EMPTY, [answers]);

  const update = useCallback(
    (questionId: string, patch: Partial<SavedAnswer>) => {
      localEdits.current[questionId] = { ...localEdits.current[questionId], ...patch };
      setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? EMPTY), ...patch } }));
      saver.current?.enqueue(questionId, patch);
    },
    [saver]
  );

  const select = useCallback(
    (questionId: string, optionId: string, allowMultiple: boolean) => {
      const current = answers[questionId]?.selectedOptionIds ?? [];
      const next = allowMultiple
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId];
      update(questionId, { selectedOptionIds: next });
    },
    [answers, update]
  );

  const clear = useCallback((questionId: string) => update(questionId, { selectedOptionIds: [] }), [update]);
  const fillBlank = useCallback((questionId: string, text: string) => update(questionId, { selectedOptionIds: text ? [text] : [] }), [update]);
  const toggleFlag = useCallback((questionId: string) => update(questionId, { flagged: !answerOf(questionId).flagged }), [answerOf, update]);

  /** Lưu nốt đáp án còn chờ rồi nộp. Ném lỗi nếu chưa lưu hết để sinh viên thử lại thay vì mất đáp án. */
  const submit = useCallback(async (): Promise<SubmitResult> => {
    const saved = await saver.current?.flush();
    if (!saved) throw new Error('Chưa lưu được đáp án mới nhất. Hãy kiểm tra kết nối mạng rồi thử nộp lại.');
    const result = await sessionApi.submit(sessionId);
    await load();
    return result;
  }, [saver, sessionId, load]);

  // Lock the UI at the deadline, even when the final server response is delayed.
  // Retry status checks because server time/network latency can differ slightly.
  useEffect(() => {
    if (!expired || payload?.session.status !== 'in_progress') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        await load();
        if (!cancelled) setExpiryError(undefined);
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
          setExpiryError(new Error('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại đúng tài khoản sinh viên để xem bài đã nộp.'));
          return;
        }
        setExpiryError(new Error('Đã hết giờ và giao diện đã khóa. Đang kết nối lại để kiểm tra bài nộp trên máy chủ.'));
      }
      if (!cancelled) timer = setTimeout(() => void check(), 2000);
    };
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [expired, payload?.session.status, load]);

  /** Hết giờ: khóa ngay rồi kiểm tra trạng thái tự nộp của server. */
  const expire = useCallback(() => {
    setExpired(true);
    void saver.current?.flush().catch(() => undefined);
  }, []);

  const counts = useMemo(() => {
    const questions = payload?.questions ?? [];
    const answered = questions.filter((q) => answers[q.id]?.selectedOptionIds.some((value) => value.trim().length > 0)).length;
    const flagged = questions.filter((q) => answers[q.id]?.flagged).length;
    return { total: questions.length, answered, unanswered: questions.length - answered, flagged };
  }, [payload, answers]);

  return { payload, loading, error, expired, expiryError, offline, saveStatus, offsetMs, answerOf, select, fillBlank, clear, toggleFlag, submit, expire, counts };
}
