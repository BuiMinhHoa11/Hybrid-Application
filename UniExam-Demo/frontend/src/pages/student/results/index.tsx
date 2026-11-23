import type { ResultDisplayStatus } from '@uniexam/contracts';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { studentResultApi } from '../../../entities/submission/api';
import { ReviewList } from '../../../entities/submission/ReviewList';
import { formatDateTime, formatScore, resultStatusLabel, useAsync } from '../../../shared/lib';
import { Alert, Badge, Card, ErrorAlert, PageHeader, Spinner, type BadgeTone } from '../../../shared/ui';

const TONE: Record<ResultDisplayStatus, BadgeTone> = { in_progress: 'amber', pending_grading: 'gray', graded: 'blue', published: 'green' };

/** UC01D: trang "Kết quả thi" (danh sách) và chi tiết từng kỳ thi. */
export default function ResultsPage() {
  const { examId } = useParams();
  return examId ? <ResultDetail examId={examId} /> : <ResultList />;
}

function ResultList() {
  const { data, error, loading, reload } = useAsync(() => studentResultApi.list(), [], 'student-results:list');

  // Theo dõi cả bài đã chấm đang chờ công bố để sinh viên tự thấy kết quả khi giáo viên công bố sớm.
  const waiting = data?.items.some((i) => i.status !== 'published') ?? false;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(reload, 10_000);
    return () => clearInterval(id);
  }, [waiting, reload]);

  return (
    <>
      <PageHeader title="Kết quả thi" />
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        <Card>
          {data && data.items.length === 0 ? (
            <div className="muted">Bạn chưa làm bài thi nào.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kỳ thi</th>
                    <th>Môn học</th>
                    <th>Nộp lúc</th>
                    <th>Trạng thái</th>
                    <th>Điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((r) => (
                    <tr key={r.examId}>
                      <td>{r.status === 'published' ? <Link to={`/student/results/${r.examId}`}>{r.title}</Link> : r.title}</td>
                      <td>{r.subject}</td>
                      <td>{formatDateTime(r.submittedAt)}</td>
                      <td>
                        <Badge tone={TONE[r.status]}>{resultStatusLabel[r.status]}</Badge>
                      </td>
                      <td>{r.status === 'published' ? `${formatScore(r.score)}/${formatScore(r.maxScore)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function ResultDetail({ examId }: { examId: string }) {
  const { data, error, loading } = useAsync(() => studentResultApi.detail(examId), [examId], 'student-results:detail');
  if (loading && !data) return <Spinner />;
  if (error || !data) {
    return (
      <>
        <PageHeader title="Kết quả thi" />
        <ErrorAlert error={error} />
        <Link to="/student/results">← Về danh sách kết quả</Link>
      </>
    );
  }
  const { item, review } = data;
  return (
    <>
      <PageHeader title={item.title}>
        <Badge tone={TONE[item.status]}>{resultStatusLabel[item.status]}</Badge>
      </PageHeader>
      <Card>
        {item.status === 'published' && review?.result ? (
          <div className="stack">
            <div>
              <div className="muted small">Điểm của bạn</div>
              <div className="score">
                {formatScore(review.result.score)} / {formatScore(review.result.maxScore)}
              </div>
            </div>
            <ReviewList review={review} />
          </div>
        ) : (
          <Alert kind="info">Điểm chỉ hiển thị sau khi giáo viên công bố kết quả.</Alert>
        )}
      </Card>
      <p>
        <Link to="/student/results">← Về danh sách kết quả</Link>
      </p>
    </>
  );
}
