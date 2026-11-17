import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiError } from '../api';

export function Button({
  variant = 'default',
  small,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger'; small?: boolean }) {
  const cls = ['btn', variant === 'default' ? '' : variant, small ? 'small' : '', className].filter(Boolean).join(' ');
  return <button type="button" {...rest} className={cls} />;
}

export type BadgeTone = 'gray' | 'green' | 'blue' | 'amber' | 'red';
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${tone === 'gray' ? '' : tone}`}>{children}</span>;
}

export function Spinner({ label = 'Đang tải...' }: { label?: string }) {
  return <div className="spinner">{label}</div>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Hiển thị lỗi API; nếu có chi tiết theo từng trường (400/422) thì liệt kê ra. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra';
  const details = error instanceof ApiError && Array.isArray(error.details) ? error.details : [];
  const lines = details
    .map((d) => (d && typeof d === 'object' && 'message' in d ? String((d as { message: unknown }).message) : null))
    .filter((x): x is string => !!x);
  return (
    <Alert>
      {message}
      {lines.length > 0 && (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

export function Field({ label, error, children, className = '' }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    // Nhãn bao quanh ô nhập để bấm vào nhãn là focus được ô, và trình đọc màn hình đọc đúng tên ô.
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="error-text">{error}</span>}
    </label>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <div className="row">{children}</div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Đang xử lý...' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>{message}</div>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="pagination">
      <span className="muted small">
        Trang {page}/{pages} ({total} mục)
      </span>
      <Button small disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trước
      </Button>
      <Button small disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Sau
      </Button>
    </div>
  );
}
