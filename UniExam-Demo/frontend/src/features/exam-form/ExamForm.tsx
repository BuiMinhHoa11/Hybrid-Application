import { useState } from 'react';
import { paperApi, teacherExamApi } from '../../entities/exam/api';
import type { AudienceMember, TeacherExam, ValidationIssue } from '../../entities/exam/types';
import { formatDateTime, formatDuration, fromLocalInput, toLocalInput, useAsync } from '../../shared/lib';
import { Alert, Button, ConfirmDialog, ErrorAlert, Field } from '../../shared/ui';
import { parseUsernames } from './audience';

interface Props {
  /** Có exam nghĩa là đang xem/sửa; không có nghĩa là tạo mới. */
  exam?: TeacherExam;
  audience?: AudienceMember[];
  onChanged: () => void;
  onClose: () => void;
}

/**
 * UC02C: tạo nháp, cập nhật, kiểm tra rồi phát hành kỳ thi.
 * Chỉ kỳ thi ở trạng thái nháp mới sửa được; đã phát hành thì chỉ xem.
 */
export function ExamForm({ exam, audience, onChanged, onClose }: Props) {
  const [examId, setExamId] = useState(exam?.id);
  const [title, setTitle] = useState(exam?.title ?? '');
  const [subject, setSubject] = useState(exam?.subject ?? '');
  const [description, setDescription] = useState(exam?.description ?? '');
  const [paperId, setPaperId] = useState(exam?.paperId ?? '');
  const [scheduled, setScheduled] = useState(!!exam?.publishAt);
  const [publishAt, setPublishAt] = useState(toLocalInput(exam?.publishAt));
  const [start, setStart] = useState(toLocalInput(exam?.startTime));
  const [end, setEnd] = useState(toLocalInput(exam?.endTime));
  const [duration, setDuration] = useState(exam?.durationMinutes ?? 60);
  const [questionCount, setQuestionCount] = useState(exam?.questionCount ?? 0);
  const [audienceText, setAudienceText] = useState((audience ?? []).map((a) => a.username).join('\n'));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const papers = useAsync(() => paperApi.list(), []);
  const readOnly = !!exam && exam.status !== 'draft';
  const usernames = parseUsernames(audienceText);

  const pickPaper = (id: string) => {
    setPaperId(id);
    // Tự điền số câu theo đề đã chọn để tránh nhập lệch; vẫn có thể sửa tay.
    const p = papers.data?.items.find((x) => x.id === id);
    if (p) {
      setQuestionCount(p.questionCount);
      if (!subject.trim()) setSubject(p.subject);
    }
  };

  /** Lưu nội dung và đối tượng dự thi; trả về id kỳ thi. */
  const save = async (): Promise<string> => {
    const startIso = fromLocalInput(start);
    const endIso = fromLocalInput(end);
    if (!startIso || !endIso) throw new Error('Chọn thời gian bắt đầu và kết thúc');
    const publishIso = scheduled ? fromLocalInput(publishAt) : null;
    if (scheduled && !publishIso) throw new Error('Chọn ngày giờ công bố cho sinh viên');
    if (publishIso && Date.parse(publishIso) > Date.parse(startIso)) throw new Error('Giờ công bố phải trước hoặc bằng giờ bắt đầu làm bài');
    const input = {
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      paperId: paperId || null,
      publishAt: publishIso,
      startTime: startIso,
      endTime: endIso,
      durationMinutes: duration,
      questionCount
    };
    const saved = examId ? await teacherExamApi.update(examId, input) : await teacherExamApi.create(input);
    setExamId(saved.id);
    await teacherExamApi.setAudience(saved.id, usernames);
    onChanged();
    return saved.id;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    run(async () => {
      setIssues([]);
      await save();
      setNotice(examId ? 'Đã cập nhật kỳ thi.' : 'Đã lưu nháp. Bấm "Kiểm tra" khi sẵn sàng phát hành.');
    });

  const check = () =>
    run(async () => {
      const id = await save();
      const res = await teacherExamApi.validate(id);
      setIssues(res.issues);
      setNotice(res.valid ? 'Kỳ thi hợp lệ, có thể phát hành.' : undefined);
    });

  const publish = () =>
    run(async () => {
      try {
        const id = await save();
        await teacherExamApi.publish(id);
        onChanged();
        onClose();
      } finally {
        setConfirmPublish(false);
      }
    });

  return (
    <div className="stack">
      {readOnly && <Alert kind="info">Kỳ thi đã phát hành nên không thể chỉnh sửa. Chỉ kỳ thi ở trạng thái nháp mới được cập nhật.</Alert>}
      <ErrorAlert error={error} />
      {notice && <Alert kind="success">{notice}</Alert>}
      {issues.length > 0 && (
        <Alert>
          Kỳ thi chưa đủ điều kiện phát hành:
          <ul>
            {issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="form-grid">
        <Field label="Tên kỳ thi" className="full">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label="Môn học">
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label="Đề thi">
          <select value={paperId} onChange={(e) => pickPaper(e.target.value)} disabled={readOnly}>
            <option value="">— Chọn đề thi —</option>
            {papers.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.questionCount} câu)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Công bố cho sinh viên">
          <select value={scheduled ? 'scheduled' : 'immediate'} onChange={(e) => setScheduled(e.target.value === 'scheduled')} disabled={readOnly}>
            <option value="immediate">Ngay sau khi bấm Phát hành</option>
            <option value="scheduled">Hẹn ngày giờ công bố</option>
          </select>
        </Field>
        {scheduled && (
          <Field label="Ngày giờ công bố cho sinh viên">
            <input type="datetime-local" value={publishAt} max={start || undefined} onChange={(e) => setPublishAt(e.target.value)} disabled={readOnly} />
          </Field>
        )}
        <div className="muted small full">
          {scheduled ? 'Sinh viên chỉ nhìn thấy kỳ thi từ giờ công bố đã chọn. Bấm Hẹn giờ công bố để kích hoạt lịch.' : 'Sinh viên nhìn thấy kỳ thi ngay sau khi bạn bấm Phát hành.'}
          {' '}Chỉ xem được câu hỏi khi bắt đầu làm bài. Thời gian tính theo múi giờ trên máy của bạn.
        </div>
        <Field label="Thời gian bắt đầu làm bài">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label="Thời gian kết thúc">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label={`Thời lượng làm bài (phút) · ${formatDuration(duration || 0)}`}>
          <input type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={readOnly} />
        </Field>
        <Field label="Số câu hỏi">
          <input type="number" min={1} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} disabled={readOnly} />
        </Field>
        <Field label="Mô tả" className="full">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label={`Đối tượng dự thi: mã sinh viên (${usernames.length} người)`} className="full">
          <textarea
            value={audienceText}
            onChange={(e) => setAudienceText(e.target.value)}
            placeholder="Mỗi mã một dòng, hoặc ngăn cách bằng dấu phẩy. Ví dụ: sv001, sv002"
            disabled={readOnly}
          />
        </Field>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={busy}>
          Đóng
        </Button>
        {!readOnly && (
          <>
            <Button onClick={saveDraft} disabled={busy}>
              {examId ? 'Cập nhật' : 'Lưu nháp'}
            </Button>
            <Button onClick={check} disabled={busy}>
              Kiểm tra
            </Button>
            <Button variant="primary" onClick={() => setConfirmPublish(true)} disabled={busy}>
              {scheduled ? 'Hẹn giờ công bố' : 'Phát hành'}
            </Button>
          </>
        )}
      </div>

      {confirmPublish && (
        <ConfirmDialog
          title={scheduled ? 'Hẹn giờ công bố kỳ thi' : 'Phát hành kỳ thi'}
          confirmLabel={scheduled ? 'Hẹn giờ công bố' : 'Phát hành'}
          busy={busy}
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
          message={scheduled
            ? `Kỳ thi sẽ hiển thị cho sinh viên từ ${formatDateTime(fromLocalInput(publishAt))}. Sinh viên chỉ làm bài từ giờ bắt đầu. Sau khi xác nhận, bạn không thể chỉnh sửa kỳ thi nữa.`
            : 'Sau khi phát hành, sinh viên thuộc đối tượng dự thi sẽ nhìn thấy kỳ thi và bạn không thể chỉnh sửa nữa. Hệ thống sẽ kiểm tra lại toàn bộ trước khi phát hành.'}
        />
      )}
    </div>
  );
}
