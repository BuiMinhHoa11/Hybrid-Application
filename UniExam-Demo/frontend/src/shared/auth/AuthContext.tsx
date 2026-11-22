import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../../entities/user/api';
import type { SessionUser } from '../../entities/user/types';
import { AUTH_EXPIRED_EVENT } from '../api';
import { clearAsyncCache } from '../lib/useAsync';
import { AUTH_STORAGE_KEY, tokenStore } from './token';

interface AuthState {
  user: SessionUser | null;
  /** true khi đang khôi phục phiên đăng nhập từ token đã lưu */
  loading: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const restore = async () => {
      const request = ++generation;
      const token = tokenStore.get();
      setUser(null);
      setLoading(!!token);
      if (!token) return;
      const current = () => !cancelled && request === generation && tokenStore.get() === token;
      try {
        const me = await authApi.me();
        if (current()) setUser({ id: me.id, username: me.username, fullName: me.fullName, role: me.role });
      } catch {
        if (current()) tokenStore.clear();
      } finally {
        if (!cancelled && request === generation) setLoading(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY && event.key !== null) return;
      tokenStore.sync(event.key === null ? null : event.newValue);
      void restore();
    };
    void restore();
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    clearAsyncCache();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
