import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionApi } from '../../entities/submission/api';
import { enterExamFullscreen, FullscreenLog } from './fullscreen';

export function useExamFullscreen(sessionId: string, active: boolean, expiresAt: string | undefined, offsetMs: number) {
  const [isFullscreen, setFullscreen] = useState(() => document.fullscreenElement === document.documentElement);
  const [error, setError] = useState<unknown>();
  const [logError, setLogError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const latest = useRef({ active, expiresAt, offsetMs });
  latest.current = { active, expiresAt, offsetMs };
  const logger = useRef<FullscreenLog>();
  const loggerSession = useRef<string>();
  const previous = useRef<boolean | null>(null);
  const wasActive = useRef(false);
  const previousSession = useRef(sessionId);
  if (previousSession.current !== sessionId) {
    previous.current = null;
    wasActive.current = false;
    previousSession.current = sessionId;
  }

  const observe = useCallback(() => {
    const fullscreen = document.fullscreenElement === document.documentElement;
    setFullscreen(fullscreen);
    const state = latest.current;
    const now = Date.now() + state.offsetMs;
    if (!state.active || !state.expiresAt || now >= Date.parse(state.expiresAt)) return;
    if (previous.current !== fullscreen && (fullscreen || previous.current === true)) {
      logger.current?.record(fullscreen ? 'fullscreen_enter' : 'fullscreen_exit', new Date(now).toISOString());
    }
    previous.current = fullscreen;
  }, []);

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = localStorage; } catch { /* Memory delivery still works. */ }
    if (!logger.current || loggerSession.current !== sessionId) {
      logger.current = new FullscreenLog(sessionId, storage, (event) => sessionApi.event(sessionId, event), setLogError);
      loggerSession.current = sessionId;
    }
    const log = logger.current;
    const flush = () => { void log.flush(); };
    const pagehide = () => {
      const state = latest.current;
      const now = Date.now() + state.offsetMs;
      if (state.active && previous.current === true && state.expiresAt && now < Date.parse(state.expiresAt)) {
        previous.current = false;
        log.record('fullscreen_exit', new Date(now).toISOString());
      }
      flush();
    };
    document.addEventListener('fullscreenchange', observe);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('online', flush);
    window.addEventListener('pageshow', observe);
    const timer = setInterval(flush, 3000);
    flush();
    return () => {
      clearInterval(timer);
      document.removeEventListener('fullscreenchange', observe);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('online', flush);
      window.removeEventListener('pageshow', observe);
    };
  }, [sessionId, observe]);

  useEffect(() => {
    if (active) { wasActive.current = true; observe(); }
    else if (wasActive.current) {
      wasActive.current = false;
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => undefined);
    }
  }, [active, observe]);

  const request = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try { await enterExamFullscreen(); observe(); }
    catch (reason) { setError(reason); }
    finally { setBusy(false); }
  }, [observe]);
  return { isFullscreen, error, logError, busy, request };
}
