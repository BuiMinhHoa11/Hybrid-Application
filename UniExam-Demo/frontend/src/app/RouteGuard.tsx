import type { Role } from '@uniexam/contracts';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/auth';
import { Spinner } from '../shared/ui';

export const homeOf: Record<Role, string> = {
  student: '/student/exams',
  teacher: '/teacher/question-bank',
  admin: '/admin/accounts'
};

/**
 * Route guard theo vai trò: chưa đăng nhập về /login, sai vai trò về trang chủ của vai trò đó.
 * (Quyền thật sự vẫn do API kiểm soát; đây chỉ là lớp giao diện.)
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Đang kiểm tra phiên đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeOf[user.role]} replace />;
  return <>{children}</>;
}
