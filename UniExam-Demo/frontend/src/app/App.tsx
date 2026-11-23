import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../shared/auth';
import { Spinner } from '../shared/ui';
import AccountsPage from '../pages/admin/accounts';
import SystemStatusPage from '../pages/admin/system-status';
import ExamAlertsPage from '../pages/admin/exam-alerts';
import LoginPage from '../pages/login';
import ExamDetailPage from '../pages/student/exam-detail';
import ExamListPage from '../pages/student/exam-list';
import ExamRoomPage from '../pages/student/exam-room';
import ResultsPage from '../pages/student/results';
import ExamPapersPage from '../pages/teacher/exam-papers';
import ExamResultsPage from '../pages/teacher/exam-results';
import ExamsPage from '../pages/teacher/exams';
import QuestionBankPage from '../pages/teacher/question-bank';
import { Layout } from './Layout';
import { RequireRole, homeOf } from './RouteGuard';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homeOf[user.role] : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Phòng thi không có thanh điều hướng để sinh viên tập trung làm bài. */}
      <Route
        path="/student/exam-room/:sessionId"
        element={
          <RequireRole roles={['student']}>
            <ExamRoomPage />
          </RequireRole>
        }
      />

      <Route
        path="/student"
        element={
          <RequireRole roles={['student']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="exams" element={<ExamListPage />} />
        <Route path="exams/:id" element={<ExamDetailPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="results/:examId" element={<ResultsPage />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <RequireRole roles={['teacher', 'admin']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="exam-papers" element={<ExamPapersPage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="exam-results" element={<ExamResultsPage />} />
        <Route path="exam-results/:examId" element={<ExamResultsPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="system-status" element={<SystemStatusPage />} />
        <Route path="exam-alerts" element={<ExamAlertsPage />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
