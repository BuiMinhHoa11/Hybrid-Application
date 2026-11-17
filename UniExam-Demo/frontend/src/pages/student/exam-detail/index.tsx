import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { studentExamApi } from '../../../entities/exam/api';
import { sessionApi } from '../../../entities/submission/api';
import { formatCountdown, formatDateTime, formatDuration, useAsync, useNow } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ErrorAlert, PageHeader, Spinner } from '../../../shared/ui';
import { examStateBadge } from '../exam-list';

/** UC01A: trang "Chi tiết kỳ thi"; UC01B: nút "Bắt đầu làm bài". */
export default function ExamDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => studentExamApi.detail(id), [id]);
  const offset = useMemo(() => (data ? Date.parse(data.serverTime) - Date.now() : 0), [data]);
  const now = useNow(offset);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>();

  useEffect(() => {
    const timer = setInterval(reload, 15_000);
    return () => clearInterval(timer);
  }, [reload]);

  if (loading && !data) return <Spinner />;
  if (error || !data) {
    return (
      <>
        <PageHeader title="Chi tiết kỳ thi" />
        <ErrorAlert error={error} />
        <Link to="/student/exams">← Về danh sách kỳ thi</Link>
      </>
    );
  }

  const exam = data.exam;
  const startMs = Date.parse(exam.startTime);
  const endMs = Date.parse(exam.endTime);
  const notYet = now < startMs;
  const over = now >= endMs;
  const badge = examStateBadge(exam);
  const submitted = exam.sessionStatus === 'submitted';
  const resume = exam.sessionStatus === 'in_progress';
  // Dựa vào giờ server để nút bật đúng lúc, không phải chờ lần tải lại kế tiếp.
  const canStart = !submitted && !notYet && !over && (exam.status === 'published' || exam.status === 'open');

  const start = async () => {
    setStarting(true);
    setStartError(undefined);
    try {
      const res = await sessionApi.start(exam.id);
      navigate(`/student/exam-room/${res.session.id}`);
    } catch (err) {
      setStartError(err);
      setStarting(false);
      reload();
    }
  };

  return (
    <>
      <PageHeader title={exam.title}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </PageHeader>
      <Card>
        <div className="form-grid">
          <Info label="Môn học" value={exam.subject} />
          <Info label="Hình thức thi" value={exam.format} />
          <Info label="Số câu hỏi" value={`${exam.questionCount} câu`} />
          <Info label="Thời gian làm bài" value={formatDuration(exam.durationMinutes)} />
          <Info label="Bắt đầu" value={formatDateTime(exam.startTime)} />
          <Info label="Kết thúc" value={formatDateTime(exam.endTime)} />
        </div>
        {exam.description && <p style={{ marginBottom: 0 }}>{exam.description}</p>}
      </Card>

      <Card>
        <div className="stack">
          <ErrorAlert error={startError} />
          {submitted ? (
            <>
              <Alert kind="success">Bạn đã nộp bài của kỳ thi này.</Alert>
              <div>
                <Link to="/student/results">Xem trạng thái và kết quả →</Link>
              </div>
            </>
          ) : notYet ? (
            <Alert kind="info">
              Kỳ thi bắt đầu sau <strong>{formatCountdown(startMs - now)}</strong>. Nút "Bắt đầu làm bài" sẽ sáng lên khi đến giờ.
            </Alert>
          ) : over && !resume ? (
            <Alert kind="info">Kỳ thi đã kết thúc.</Alert>
          ) : (
            <Alert kind="info">
              Khi bấm bắt đầu, đồng hồ đếm ngược chạy {formatDuration(exam.durationMinutes)} và không dừng lại dù bạn thoát trang. Đáp án được lưu tự động; hết giờ bài sẽ được tự động nộp.
            </Alert>
          )}
          {!submitted && (
            <div>
              <Button variant="primary" disabled={!canStart || starting} onClick={start}>
                {starting ? 'Đang vào phòng thi...' : resume ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}
              </Button>
            </div>
          )}
        </div>
      </Card>
      <p>
        <Link to="/student/exams">← Về danh sách kỳ thi</Link>
      </p>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      <div>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
