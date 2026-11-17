import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionApi } from '../../entities/submission/api';
import type { SavedAnswer, SessionPayload, SubmitResult } from '../../entities/submission/types';
import { Autosaver, type SaveStatus } from './autosave';

const EMPTY: SavedAnswer = { selectedOptionIds: [], flagged: false };

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
  /** serverTime - Date.now() tại lúc tải: bù lệch đồng hồ giữa máy sinh viên và server. */
  const [offsetMs, setOffsetMs] = useState(0);
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const localEdits = useRef<Record<string, Partial<SavedAnswer>>>({});

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const data = await sessionApi.get(sessionId);
    // Chỉ request mới nhất của lần mount hiện tại được cập nhật giao diện.
    // Cleanup cũng vô hiệu hóa request cũ của StrictMode dù sessionId không đổi.
    if (!mounted.current || generation !== loadGeneration.current || activeSession.current !== sessionId) return data;
    setPayload(data);
    if (data.session.status === 'in_progress') {
      const merged = { ...data.answers };
      // Một GET có thể chụp dữ liệu trước autosave. Giữ các trường sinh viên
      // vừa sửa để câu trả lời/cờ xem lại không bị phản hồi chậm ghi đè.
      for (const [questionId, patch] of Object.entries(localEdits.current)) {
        merged[questionId] = { ...(merged[questionId] ?? EMPTY), ...patch };
      }
      setAnswers(merged);
    } else {
      localEdits.current = {};
      setAnswers(data.answers);
    }
    setOffsetMs(Date.parse(data.serverTime) - Date.now());
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
    load()
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, [load]);

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

  /** Hết giờ: server tự nộp khi tải lại phiên. */
  const expire = useCallback(() => {
    void saver.current
      ?.flush()
      .then(() => load())
      .catch(() => undefined);
  }, [saver, load]);

  const counts = useMemo(() => {
    const questions = payload?.questions ?? [];
    const answered = questions.filter((q) => answers[q.id]?.selectedOptionIds.some((value) => value.trim().length > 0)).length;
    const flagged = questions.filter((q) => answers[q.id]?.flagged).length;
    return { total: questions.length, answered, unanswered: questions.length - answered, flagged };
  }, [payload, answers]);

  return { payload, loading, error, saveStatus, offsetMs, answerOf, select, fillBlank, clear, toggleFlag, submit, expire, counts };
}
