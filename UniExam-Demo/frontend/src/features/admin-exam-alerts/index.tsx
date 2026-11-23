import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { adminAlertApi, watchAdminAlerts, type AlertConnection } from '../../entities/admin-alert/api';
import type { AdminAlertSnapshot, AdminExamAlert } from '../../entities/admin-alert/types';
import { Button } from '../../shared/ui';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
export const alertTime = (value: string) => timeFormat.format(new Date(value));

interface AlertState {
  snapshot: AdminAlertSnapshot;
  connection: AlertConnection;
  busy: boolean;
  error: unknown;
  read: (id?: string) => Promise<void>;
}
const AlertContext = createContext<AlertState | null>(null);
export const useAdminAlerts = () => useContext(AlertContext);

export function AdminExamAlertsProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AdminAlertSnapshot>({ items: [], activeSessions: [], unreadCount: 0, latestId: '0' });
  const [connection, setConnection] = useState<AlertConnection>('connecting');
  const [toast, setToast] = useState<AdminExamAlert | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const seen = useRef(new Set<string>());

  const receive = useCallback((next: AdminAlertSnapshot) => {
    const fresh = next.items.find((item) => !item.readAt && !seen.current.has(item.id));
    for (const item of next.items) seen.current.add(item.id);
    setSnapshot(next);
    if (fresh) setToast(fresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void watchAdminAlerts(controller.signal, receive, setConnection);
    return () => controller.abort();
  }, [receive]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 15000);
    return () => clearTimeout(timer);
  }, [toast]);

  const read = async (id?: string) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      receive(id ? await adminAlertApi.read(id) : await adminAlertApi.readAll(snapshot.latestId));
      if (!id || toast?.id === id) setToast(null);
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  };

  return <AlertContext.Provider value={{ snapshot, connection, busy, error, read }}>
    {children}
    {toast && createPortal(<aside className="admin-alert-toast" role="alert">
      <div className="row between"><strong>Thí sinh thoát toàn màn hình</strong><Button small onClick={() => setToast(null)} aria-label="Ẩn thông báo">✕</Button></div>
      <p><strong>{toast.fullName}</strong> ({toast.username}) · {toast.examTitle}</p>
      <div className="small">Thời điểm thoát: {alertTime(toast.clientTime)}</div>
      <Link className="btn small" to="/admin/exam-alerts" onClick={() => setToast(null)}>Xem cảnh báo</Link>
    </aside>, document.body)}
  </AlertContext.Provider>;
}
