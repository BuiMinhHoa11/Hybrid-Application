import { ROLES, type Role } from '@uniexam/contracts';
import { useState } from 'react';
import { adminUserApi } from '../../../entities/user/api';
import type { User } from '../../../entities/user/types';
import { useAuth } from '../../../shared/auth';
import { formatDateTime, roleLabel, useAsync } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorAlert, Field, Modal, PageHeader, Pagination, Spinner } from '../../../shared/ui';

type Dialog = { kind: 'create' } | { kind: 'view'; user: User } | { kind: 'edit'; user: User } | { kind: 'toggle'; user: User } | null;

/** UC03A: trang "Quản lý tài khoản". */
export default function AccountsPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string>();
  const list = useAsync(() => adminUserApi.list({ q, role, active, page, pageSize: 15 }), [q, role, active, page]);

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    list.reload();
  };

  return (
    <>
      <PageHeader title="Quản lý tài khoản">
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>Tạo tài khoản</Button>
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      <Card>
        <div className="filters">
          <input type="text" placeholder="Tìm theo mã, họ tên hoặc email..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Tìm kiếm" />
          <select value={role} onChange={(e) => { setRole(e.target.value as Role | ''); setPage(1); }} aria-label="Lọc theo vai trò">
            <option value="">Mọi vai trò</option>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </select>
          <select value={active} onChange={(e) => { setActive(e.target.value as '' | 'true' | 'false'); setPage(1); }} aria-label="Lọc theo trạng thái">
            <option value="">Mọi trạng thái</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã khóa</option>
          </select>
        </div>
        <ErrorAlert error={list.error} />
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.data && list.data.items.length === 0 ? (
          <div className="muted">Không tìm thấy tài khoản nào.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data?.items.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.fullName}</td>
                      <td>{u.email ?? '—'}</td>
                      <td>{roleLabel[u.role]}</td>
                      <td>{u.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="red">Đã khóa</Badge>}</td>
                      <td className="actions">
                        <Button small onClick={() => setDialog({ kind: 'view', user: u })}>Xem</Button>
                        <Button small onClick={() => setDialog({ kind: 'edit', user: u })}>Cập nhật</Button>
                        <Button small variant={u.isActive ? 'danger' : 'default'} disabled={u.id === me?.id} title={u.id === me?.id ? 'Không thể tự khóa tài khoản của mình' : undefined} onClick={() => setDialog({ kind: 'toggle', user: u })}>
                          {u.isActive ? 'Khóa' : 'Mở khóa'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      {dialog?.kind === 'create' && <CreateDialog onClose={() => setDialog(null)} onSaved={() => done('Đã tạo tài khoản. Người dùng có thể đăng nhập bằng mật khẩu vừa đặt.')} />}
      {dialog?.kind === 'view' && <ViewDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <EditDialog user={dialog.user} isSelf={dialog.user.id === me?.id} onClose={() => setDialog(null)} onSaved={() => done('Đã cập nhật tài khoản.')} />
      )}
      {dialog?.kind === 'toggle' && <ToggleDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function CreateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const usernameError = username && !/^[a-zA-Z0-9._-]{3,50}$/.test(username)
    ? 'Dùng 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' : undefined;
  const passwordError = password && password.length < 8 ? 'Mật khẩu phải có ít nhất 8 ký tự.' : undefined;
  const canSave = !!username && !usernameError && !!fullName.trim() && password.length >= 8;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(undefined);
    try {
      await adminUserApi.create({ username, fullName: fullName.trim(), email: email.trim() || null, role, password });
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal title="Tạo tài khoản" onClose={onClose} footer={<>
      <Button onClick={onClose} disabled={busy}>Hủy</Button>
      <Button variant="primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Đang tạo...' : 'Tạo tài khoản'}</Button>
    </>}>
      <div className="stack">
        <ErrorAlert error={error} />
        <Field label="Tên đăng nhập / mã sinh viên" error={usernameError || undefined}>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={50} autoComplete="off" />
          <span className="muted small">Giáo viên dùng mã này để chỉ định sinh viên vào kỳ thi.</span>
        </Field>
        <Field label="Họ tên"><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} /></Field>
        <Field label="Email (không bắt buộc)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Vai trò"><select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </select></Field>
        <Field label="Mật khẩu" error={passwordError || undefined}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={200} autoComplete="new-password" placeholder="Tối thiểu 8 ký tự" />
        </Field>
      </div>
    </Modal>
  );
}

function ViewDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { data, error, loading } = useAsync(() => adminUserApi.get(user.id), [user.id]);
  return (
    <Modal title={`Tài khoản ${user.username}`} onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <div className="form-grid">
            <Row label="Họ tên" value={data.fullName} />
            <Row label="Email" value={data.email ?? '—'} />
            <Row label="Vai trò" value={roleLabel[data.role]} />
            <Row label="Trạng thái" value={data.isActive ? 'Đang hoạt động' : 'Đã khóa'} />
            <Row label="Ngày tạo" value={formatDateTime(data.createdAt)} />
            <Row label="Cập nhật" value={formatDateTime(data.updatedAt)} />
            <Row label="Câu hỏi đã soạn" value={String(data.stats.questions)} />
            <Row label="Kỳ thi đã tạo" value={String(data.stats.exams)} />
            <Row label="Lượt làm bài" value={String(data.stats.sessions)} />
          </div>
        )
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function EditDialog({ user, isSelf, onClose, onSaved }: { user: User; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const passwordError = password && password.length < 8 ? 'Mật khẩu phải có ít nhất 8 ký tự.' : undefined;

  const save = async () => {
    if (passwordError) return;
    setBusy(true);
    setError(undefined);
    try {
      await adminUserApi.update(user.id, {
        fullName: fullName.trim(),
        email: email.trim() || null,
        role,
        ...(password ? { password } : {})
      });
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Cập nhật ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Hủy</Button>
          <Button variant="primary" onClick={save} disabled={busy || !fullName.trim() || !!passwordError}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={error} />
        <Field label="Họ tên">
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Vai trò">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </select>
          {isSelf && <span className="muted small">Không thể tự đổi vai trò của chính mình.</span>}
        </Field>
        <Field label="Đặt lại mật khẩu (để trống nếu không đổi)" error={passwordError || undefined}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={200} autoComplete="new-password" placeholder="Tối thiểu 8 ký tự" />
        </Field>
      </div>
    </Modal>
  );
}

function ToggleDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const locking = user.isActive;

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (locking) await adminUserApi.lock(user.id);
      else await adminUserApi.unlock(user.id);
      onDone(locking ? `Đã khóa tài khoản ${user.username}.` : `Đã mở khóa tài khoản ${user.username}.`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={locking ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
      danger={locking}
      confirmLabel={locking ? 'Khóa' : 'Mở khóa'}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
      message={
        locking ? (
          <>Khóa tài khoản <strong>{user.username}</strong>? Người này sẽ không đăng nhập được và phiên đang dùng bị vô hiệu ngay.</>
        ) : (
          <>Mở khóa tài khoản <strong>{user.username}</strong>?</>
        )
      }
    />
  );
}
