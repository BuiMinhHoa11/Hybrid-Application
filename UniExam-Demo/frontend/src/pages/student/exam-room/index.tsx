import { useEffect, useState } from 'react';
import { MAX_TEXT_ANSWER_LENGTH } from '@uniexam/contracts';
import { Link, useParams } from 'react-router-dom';
import { CountdownTimer, FlagReview, QuestionPalette, SubmitDialog, useExamSession, type SaveStatus } from '../../../features/exam-taking';
import { useExamFullscreen } from '../../../features/exam-taking/useExamFullscreen';
import { optionLetter } from '../../../shared/lib';
import { Alert, Button, Card, ErrorAlert, Field, QuestionImage, Spinner } from '../../../shared/ui';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Đang lưu...',
  saved: '✓ Đã lưu',
  error: '⚠ Có đáp án chưa lưu lên máy chủ (đang giữ trên máy này và tự gửi lại). Kiểm tra kết nối trước khi nộp.'
};

/** UC01B: làm bài; UC01C: nộp bài. */
export default function ExamRoomPage() {
  const { sessionId = '' } = useParams();
  const room = useExamSession(sessionId);
  const fullscreen = useExamFullscreen(sessionId, room.payload?.session.status === 'in_progress' && !room.expired,
    room.payload?.session.expiresAt, room.offsetMs);
  const [current, setCurrent] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>();

  const inProgress = room.payload?.session.status === 'in_progress' && !room.expired;

  // Cảnh báo khi vô tình đóng/tải lại trang lúc đang làm bài.
  useEffect(() => {
    if (!inProgress) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inProgress]);

  if (room.loading && !room.payload) return <Spinner label="Đang tải đề thi..." />;
  if (room.error || !room.payload) {
    return (
      <div className="container">
        <ErrorAlert error={room.error} />
        <p>
          <Link to="/student/exams">← Về danh sách kỳ thi</Link>
        </p>
      </div>
    );
  }

  const { payload } = room;

  if (payload.session.status === 'submitted') {
    const timeout = payload.session.submitReason === 'timeout';
    return (
      <div className="container">
        <Card>
          <div className="stack">
            <h1>{payload.exam.title}</h1>
            {timeout ? (
              <Alert kind="info">Đã hết giờ làm bài. Hệ thống đã khóa bài và tự động nộp các đáp án bạn đã lưu.</Alert>
            ) : (
              <Alert kind="success">Nộp bài thành công. Bài của bạn đang ở trạng thái chờ chấm.</Alert>
            )}
            <div className="muted">Điểm chỉ được hiển thị sau khi giáo viên công bố kết quả.</div>
            <div className="row">
              <Link to={`/student/results`}>Xem trạng thái bài làm</Link>
              <Link to="/student/exams">Về danh sách kỳ thi</Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (room.expired) {
    return (
      <div className="container">
        <Card>
          <div className="stack">
            <h1>{payload.exam.title}</h1>
            <Alert kind="info">Đã hết giờ làm bài. Giao diện đã khóa; hệ thống tự nộp các đáp án đã lưu.</Alert>
            <ErrorAlert error={room.expiryError} />
            {!room.expiryError && <Spinner label="Đang xác nhận trạng thái bài nộp..." />}
            <Link to="/student/results">Xem trạng thái bài làm</Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!fullscreen.isFullscreen) {
    return (
      <div className="container">
        <Card><div className="stack">
          <h1>Yêu cầu toàn màn hình</h1>
          <CountdownTimer expiresAtMs={Date.parse(payload.session.expiresAt)} offsetMs={room.offsetMs} onExpire={room.expire} />
          <Alert kind="info">Bạn phải ở chế độ toàn màn hình để làm bài. Thời gian thi vẫn chạy; các lần thoát toàn màn hình được lưu trong nhật ký để giáo viên xem lại.</Alert>
          <ErrorAlert error={fullscreen.error} />
          {fullscreen.logError && <Alert>{fullscreen.logError}</Alert>}
          <Button variant="primary" onClick={fullscreen.request} disabled={fullscreen.busy}>
            {fullscreen.busy ? 'Đang mở toàn màn hình...' : 'Quay lại toàn màn hình và tiếp tục thi'}
          </Button>
        </div></Card>
      </div>
    );
  }

  const questions = payload.questions;
  const q = questions[Math.min(current, questions.length - 1)];
  const answer = room.answerOf(q.id);

  const doSubmit = async () => {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await room.submit();
      setConfirming(false);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {fullscreen.logError && <Alert>{fullscreen.logError}</Alert>}
      {room.offline && (
        <Alert>
          Đang mất kết nối tới máy chủ. Bạn vẫn làm bài bình thường: đáp án được giữ trên máy này và tự gửi lên khi
          kết nối lại. Đừng xóa dữ liệu trình duyệt; chỉ bấm Nộp bài khi đã có kết nối.
        </Alert>
      )}
      <div className="room-top">
        <div className="room-top-inner">
          <div className="grow">
            <strong>{payload.exam.title}</strong>
            <div className="muted small">
              {payload.exam.subject} · {SAVE_LABEL[room.saveStatus]}
            </div>
          </div>
          <CountdownTimer expiresAtMs={Date.parse(payload.session.expiresAt)} offsetMs={room.offsetMs} onExpire={room.expire} />
          <Button variant="primary" onClick={() => setConfirming(true)}>
            Nộp bài
          </Button>
        </div>
      </div>

      <div className="room-body">
        <Card>
          <div className="row between" style={{ marginBottom: 12 }}>
            <strong>
              Câu {q.position}/{questions.length}
            </strong>
            <span className="muted small">
              {q.points} điểm{q.type === 'fill_blank' ? ' · điền vào chỗ trống' : q.allowMultiple ? ' · chọn nhiều đáp án' : ''}
            </span>
          </div>
          <div className="question-text">{q.content}</div>
          <QuestionImage src={q.imageDataUrl} alt={`Hình minh họa câu ${q.position}`} />
          {q.type === 'fill_blank' ? (
            <Field label="Câu trả lời của bạn">
              <input type="text" maxLength={MAX_TEXT_ANSWER_LENGTH} autoComplete="off" spellCheck={false}
                value={answer.selectedOptionIds[0] ?? ''} onChange={(e) => room.fillBlank(q.id, e.target.value)}
                placeholder="Nhập đáp án vào đây..." />
            </Field>
          ) : <div role={q.allowMultiple ? 'group' : 'radiogroup'}>
            {q.options.map((o, i) => {
              const selected = answer.selectedOptionIds.includes(o.id);
              return (
                <label key={o.id} className={`option ${selected ? 'selected' : ''}`}>
                  <input
                    type={q.allowMultiple ? 'checkbox' : 'radio'}
                    name={`q-${q.id}`}
                    checked={selected}
                    onChange={() => room.select(q.id, o.id, q.allowMultiple)}
                  />
                  <span>
                    <strong>{optionLetter(i)}.</strong> {o.text}
                  </span>
                </label>
              );
            })}
          </div>}
          <div className="row between" style={{ marginTop: 16 }}>
            <div className="row">
              <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                ← Câu trước
              </Button>
              <Button disabled={current >= questions.length - 1} onClick={() => setCurrent(current + 1)}>
                Câu sau →
              </Button>
            </div>
            <div className="row">
              {answer.selectedOptionIds.length > 0 && (
                <Button small onClick={() => room.clear(q.id)}>
                  {q.type === 'fill_blank' ? 'Xóa câu trả lời' : 'Bỏ chọn'}
                </Button>
              )}
              <FlagReview flagged={answer.flagged} onToggle={() => room.toggleFlag(q.id)} />
            </div>
          </div>
        </Card>

        <div>
          <Card>
            <h3>Bảng câu hỏi</h3>
            <QuestionPalette questions={questions} answerOf={room.answerOf} current={current} onSelect={setCurrent} />
            <div className="muted small" style={{ marginTop: 12 }}>
              Đã trả lời {room.counts.answered}/{room.counts.total} · Xem lại {room.counts.flagged}
            </div>
          </Card>
        </div>
      </div>

      {confirming && (
        <SubmitDialog counts={room.counts} busy={submitting} error={submitError} onConfirm={doSubmit} onCancel={() => setConfirming(false)} />
      )}
    </>
  );
}
