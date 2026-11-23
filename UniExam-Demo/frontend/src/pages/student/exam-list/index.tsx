import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { studentExamApi } from '../../../entities/exam/api';
import type { StudentExam } from '../../../entities/exam/types';
import { formatDateTime, formatDuration, useAsync } from '../../../shared/lib';
import { Badge, Card, ErrorAlert, PageHeader, Spinner, type BadgeTone } from '../../../shared/ui';

export function examStateBadge(e: StudentExam): { label: string; tone: BadgeTone } {
  if (e.sessionStatus === 'submitted') return { label: 'Đã nộp bài', tone: 'green' };
  if (e.sessionStatus === 'in_progress') return { label: 'Đang làm bài', tone: 'amber' };
  if (e.availability === 'open') return { label: 'Đang mở', tone: 'blue' };
  if (e.availability === 'ended') return { label: 'Đã kết thúc', tone: 'gray' };
  return { label: 'Sắp diễn ra', tone: 'gray' };
}

/** UC01A: trang "Kỳ thi". */
export default function ExamListPage() {
  const { data, error, loading, reload } = useAsync(() => studentExamApi.list(), [], 'student-exams:list');

  // Cập nhật định kỳ để trạng thái "Sắp diễn ra" -> "Đang mở" tự đổi mà không cần tải lại trang.
  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <>
      <PageHeader title="Kỳ thi" />
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        <Card>
          {data && data.items.length === 0 ? (
            <div className="muted">Hiện chưa có kỳ thi nào dành cho bạn.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kỳ thi</th>
                    <th>Môn học</th>
                    <th>Bắt đầu</th>
                    <th>Thời lượng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((e) => {
                    const b = examStateBadge(e);
                    return (
                      <tr key={e.id}>
                        <td>
                          <Link to={`/student/exams/${e.id}`}>{e.title}</Link>
                        </td>
                        <td>{e.subject}</td>
                        <td>{formatDateTime(e.startTime)}</td>
                        <td>{formatDuration(e.durationMinutes)}</td>
                        <td>
                          <Badge tone={b.tone}>{b.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
