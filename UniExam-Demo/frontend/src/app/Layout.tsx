import type { Role } from '@uniexam/contracts';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../shared/auth';
import { roleLabel } from '../shared/lib';
import { Button } from '../shared/ui';
import { AdminExamAlertsProvider, useAdminAlerts } from '../features/admin-exam-alerts';
import { useOfflineSubmissionSync } from '../features/exam-taking';

const NAV: Record<Role, Array<{ to: string; label: string }>> = {
  student: [
    { to: '/student/exams', label: 'Kỳ thi' },
    { to: '/student/results', label: 'Kết quả thi' }
  ],
  teacher: [
    { to: '/teacher/question-bank', label: 'Ngân hàng câu hỏi' },
    { to: '/teacher/exam-papers', label: 'Đề thi' },
    { to: '/teacher/exams', label: 'Kỳ thi' },
    { to: '/teacher/exam-results', label: 'Kết quả kỳ thi' }
  ],
  admin: [
    { to: '/admin/accounts', label: 'Quản lý tài khoản' },
    { to: '/admin/system-status', label: 'Trạng thái hệ thống' },
    { to: '/admin/exam-alerts', label: 'Cảnh báo' }
  ]
};

export function Layout() {
  const { user } = useAuth();
  // Sinh viên còn bài nộp lúc mất mạng chưa gửi được: tự gửi khi đang ở bất kỳ trang nào.
  useOfflineSubmissionSync(user?.role === 'student');
  if (!user) return null;
  return user.role === 'admin'
    ? <AdminExamAlertsProvider key={user.id}><LayoutContent /></AdminExamAlertsProvider>
    : <LayoutContent />;
}

function LayoutContent() {
  const { user, logout } = useAuth();
  const alerts = useAdminAlerts();
  if (!user) return null;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">UniExam</span>
          <nav className="nav">
            {NAV[user.role].map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
                {item.to === '/admin/exam-alerts' && !!alerts?.snapshot.activeSessions.length && <span className="badge red" style={{ marginLeft: 6 }}>{alerts.snapshot.activeSessions.length}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="row">
            <span className="small">
              {user.fullName} <span className="muted">({roleLabel[user.role]})</span>
            </span>
            <Button small onClick={logout}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
