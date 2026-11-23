import type { SubmissionStatus } from '@uniexam/contracts';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { examResultApi } from '../../../entities/submission/api';
import { ReviewList } from '../../../entities/submission/ReviewList';
import type { ResultRow } from '../../../entities/submission/types';
import { PublishResults } from '../../../features/publish-results';
import { examStatusLabel, formatDateTime, formatScore, submissionStatusLabel, useAsync } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ErrorAlert, Modal, PageHeader, Spinner, type BadgeTone } from '../../../shared/ui';
import type { ExamStatus } from '@uniexam/contracts';
import { ScoreDistribution } from './ScoreDistribution';

const TONE: Record<SubmissionStatus, BadgeTone> = { pending_grading: 'gray', grading: 'blue', graded: 'green', failed: 'red' };

/** UC02D: trang "Kết quả kỳ thi" (chọn kỳ thi) và chi tiết kết quả từng kỳ. */
export default function ExamResultsPage() {
  const { examId } = useParams();
  return examId ? <ResultsOfExam examId={examId} /> : <ExamPicker />;
}

function ExamPicker() {
  const { data, error, loading } = useAsync(() => examResultApi.exams(), [], 'exam-results:exams');
  return (
    <>
      <PageHeader title="Kết quả kỳ thi" />
      <ErrorAlert error={error} />
      <Card>
        {loading && !data ? (
          <Spinner />
        ) : data && data.items.length === 0 ? (
          <div className="muted">Chưa có kỳ thi nào được phát hành.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kỳ thi</th>
                  <th>Môn học</th>
                  <th>Trạng thái</th>
                  <th>Đã nộp</th>
                  <th>Đã chấm</th>
                  <th>Công bố</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td>{e.subject}</td>
                    <td>{examStatusLabel[e.status as ExamStatus] ?? e.status}</td>
                    <td>
                      {e.submittedCount}/{e.audienceCount}
                    </td>
                    <td>
                      {e.gradedCount}/{e.submittedCount}
                    </td>
                    <td>{e.resultsPublished ? <Badge tone="green">Đã công bố</Badge> : <Badge>Chưa</Badge>}</td>
                    <td className="actions">
                      <Link to={`/teacher/exam-results/${e.id}`}>Xem kết quả</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ResultsOfExam({ examId }: { examId: string }) {
  const { data, error, loading, reload } = useAsync(() => examResultApi.results(examId), [examId], 'exam-results:results');
  const [viewing, setViewing] = useState<ResultRow | null>(null);
  const [viewingEvents, setViewingEvents] = useState<ResultRow | null>(null);
  useEffect(() => {
    if (data?.exam.resultsPublished) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [data?.exam.resultsPublished, reload]);

  if (loading && !data) return <Spinner />;
  if (error || !data) {
    return (
      <>
        <PageHeader title="Kết quả kỳ thi" />
        <ErrorAlert error={error} />
        <Link to="/teacher/exam-results">← Về danh sách kỳ thi</Link>
      </>
    );
  }

  const { exam, rows, stats, publication } = data;
  const { blockedReason, early } = publication;

  return (
    <>
      <PageHeader title={exam.title}>
        <Button onClick={reload}>Làm mới</Button>
        <PublishResults examId={examId} published={exam.resultsPublished} blockedReason={blockedReason} early={early} onPublished={reload} />
      </PageHeader>

      {!exam.resultsPublished && blockedReason && <Alert kind="info">{blockedReason}.</Alert>}
      {!exam.resultsPublished && publication.canPublish && (
        <Alert kind="info">{early
          ? 'Tất cả thí sinh đã nộp và chấm xong. Bạn có thể công bố ngay mà không cần chờ hết giờ thi; kỳ thi sẽ được đóng khi công bố.'
          : 'Các bài đã chấm xong. Bạn có thể chọn công bố ngay hoặc giữ kết quả chưa công bố.'}</Alert>
      )}

      <Card>
        <div className="row" style={{ gap: 28 }}>
          <Stat label="Đối tượng dự thi" value={stats.audience} />
          <Stat label="Đã vào thi" value={stats.started} />
          <Stat label="Đã nộp" value={stats.submitted} />
          <Stat label="Đã chấm" value={stats.graded} />
          <Stat label="Điểm trung bình" value={formatScore(stats.averageScore).replace('.', ',')} />
          <Stat label="Trung vị" value={formatScore(stats.medianScore).replace('.', ',')} />
          <Stat label="Cao nhất" value={formatScore(stats.maxScore).replace('.', ',')} />
          <Stat label="Thấp nhất" value={formatScore(stats.minScore).replace('.', ',')} />
        </div>
      </Card>

      <ScoreDistribution rows={rows} stats={stats} />

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã SV</th>
                <th>Họ tên</th>
                <th>Nộp lúc</th>
                <th>Trạng thái chấm</th>
                <th>Điểm</th>
                <th>Thoát toàn màn hình</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td>{r.username}</td>
                  <td>{r.fullName}</td>
                  <td>
                    {formatDateTime(r.submittedAt)}
                    {r.submitReason === 'timeout' && <div className="muted small">Hết giờ, hệ thống tự nộp</div>}
                    {r.submitReason === 'offline' && (
                      <div className="small">
                        <Badge tone="amber">Nộp ngoại tuyến</Badge>
                        <div className="muted">
                          Mất kết nối khoảng {Math.round((r.offlineSeconds ?? 0) / 60)} phút
                          {(r.offlineLateSeconds ?? 0) > 0 ? ` · gửi tới máy chủ trễ ${Math.ceil((r.offlineLateSeconds ?? 0) / 60)} phút sau giờ hết hạn` : ''}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {r.submissionStatus ? (
                      <Badge tone={TONE[r.submissionStatus]}>{submissionStatusLabel[r.submissionStatus]}</Badge>
                    ) : r.sessionStatus === 'in_progress' ? (
                      <Badge tone="amber">Đang làm bài</Badge>
                    ) : (
                      <span className="muted">Chưa làm bài</span>
                    )}
                  </td>
                  <td>{r.score !== null ? `${formatScore(r.score)}/${formatScore(r.maxScore)}` : '—'}</td>
                  <td>
                    {r.sessionId ? <Button small onClick={() => setViewingEvents(r)}>
                      Nhật ký ({r.fullscreenExitCount ?? 0} lần thoát)
                    </Button> : '—'}
                  </td>
                  <td className="actions">
                    {r.submissionId && (
                      <Button small onClick={() => setViewing(r)}>
                        Xem bài làm
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p>
        <Link to="/teacher/exam-results">← Về danh sách kỳ thi</Link>
      </p>

      {viewing && viewing.submissionId && <SubmissionView examId={examId} row={viewing} onClose={() => setViewing(null)} />}
      {viewingEvents?.sessionId && <FullscreenEventsView examId={examId} row={viewingEvents} onClose={() => setViewingEvents(null)} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function FullscreenEventsView({ examId, row, onClose }: { examId: string; row: ResultRow; onClose: () => void }) {
  const { data, error, loading, reload } = useAsync(() => examResultApi.events(examId, row.sessionId!), [examId, row.sessionId]);
  return (
    <Modal title={`Nhật ký toàn màn hình: ${row.fullName} (${row.username})`} onClose={onClose} wide footer={<>
      <Button onClick={reload}>Làm mới</Button><Button onClick={onClose}>Đóng</Button>
    </>}>
      <ErrorAlert error={error} />
      {loading && !data ? <Spinner /> : data && <div className="stack">
        <strong>Số lần thoát toàn màn hình: {data.fullscreenExitCount}</strong>
        <span className="muted small">Nhật ký phản ánh sự kiện do trình duyệt báo về. Thời điểm tiếp nhận được máy chủ lưu riêng.</span>
        {!data.items.length ? <Alert kind="info">Chưa ghi nhận sự kiện toàn màn hình của bài thi này.</Alert> : <div className="table-wrap"><table>
          <thead><tr><th>Sự kiện</th><th>Thời điểm ghi nhận trên máy</th><th>Máy chủ tiếp nhận</th></tr></thead>
          <tbody>{data.items.map((event) => <tr key={event.id}>
            <td><Badge tone={event.type === 'fullscreen_exit' ? 'red' : 'green'}>
              {event.type === 'fullscreen_exit' ? 'Thoát toàn màn hình' : 'Vào toàn màn hình'}
            </Badge></td>
            <td>{formatDateTime(event.clientTime)}</td><td>{formatDateTime(event.receivedAt)}</td>
          </tr>)}</tbody>
        </table></div>}
        {data.total > data.items.length && <span className="muted small">Hiển thị {data.items.length}/{data.total} sự kiện đầu tiên.</span>}
      </div>}
    </Modal>
  );
}

function SubmissionView({ examId, row, onClose }: { examId: string; row: ResultRow; onClose: () => void }) {
  const { data, error, loading } = useAsync(() => examResultApi.submission(examId, row.submissionId!), [examId, row.submissionId]);
  return (
    <Modal title={`Bài làm của ${row.fullName} (${row.username})`} onClose={onClose} wide footer={<Button onClick={onClose}>Đóng</Button>}>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <div className="stack">
            {data.result ? (
              <div className="score">
                {formatScore(data.result.score)} / {formatScore(data.result.maxScore)}
              </div>
            ) : (
              <Alert kind="info">Bài chưa được chấm xong.</Alert>
            )}
            <ReviewList review={data} />
          </div>
        )
      )}
    </Modal>
  );
}
