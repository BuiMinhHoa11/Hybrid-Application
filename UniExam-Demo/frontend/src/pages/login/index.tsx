import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homeOf } from '../../app/RouteGuard';
import { ApiError } from '../../shared/api';
import { useAuth } from '../../shared/auth';
import { Button, Card, ErrorAlert, Field, Spinner } from '../../shared/ui';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const invalidCredentials = error instanceof ApiError && error.status === 401;

  if (loading) return <Spinner />;
  if (user) return <Navigate to={homeOf[user.role]} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const u = await login(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith(`/${u.role === 'admin' ? 'admin' : u.role}`) ? from : homeOf[u.role], { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <h1 style={{ color: 'var(--primary)' }}>UniExam</h1>
            <div className="muted">Hệ thống thi trắc nghiệm trực tuyến</div>
          </div>
          <ErrorAlert error={invalidCredentials ? new Error('Sai tên đăng nhập hoặc mật khẩu') : error} />
          <Field label="Tên đăng nhập">
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(undefined); }} aria-invalid={invalidCredentials || undefined} autoFocus autoComplete="username" required />
          </Field>
          <Field label="Mật khẩu">
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(undefined); }} aria-invalid={invalidCredentials || undefined} autoComplete="current-password" required />
          </Field>
          <Button variant="primary" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
