import { useEffect, useId, useRef, useState } from 'react';
import { DIFFICULTIES, MAX_ACCEPTED_ANSWERS, MAX_TEXT_ANSWER_LENGTH, normalizeTextAnswer, type Difficulty, type QuestionType } from '@uniexam/contracts';
import type { Question, QuestionFilters, QuestionInput } from '../../entities/question/types';
import { difficultyLabel, optionLetter } from '../../shared/lib';
import { Button, ErrorAlert, Field, QuestionImage } from '../../shared/ui';

interface DraftOption {
  text: string;
  correct: boolean;
}

const MAX_OPTIONS = 8;

/** Kiểm tra giống phía server (UC02A): có nội dung, có đáp án đúng, điểm lớn hơn 0. */
export function validateQuestionForm(f: { subject: string; content: string; options: DraftOption[]; points: number; type?: QuestionType; acceptedAnswers?: string[] }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!f.subject.trim()) errors.subject = 'Nhập môn học';
  if (!f.content.trim()) errors.content = 'Nhập nội dung câu hỏi';
  if (f.type === 'fill_blank') {
    const answers = f.acceptedAnswers ?? [];
    if (!answers.length || answers.some((answer) => !answer.trim())) errors.acceptedAnswers = 'Nhập ít nhất một đáp án được chấp nhận';
    else if (answers.length > MAX_ACCEPTED_ANSWERS) errors.acceptedAnswers = `Tối đa ${MAX_ACCEPTED_ANSWERS} đáp án được chấp nhận`;
    else if (answers.some((answer) => answer.length > MAX_TEXT_ANSWER_LENGTH)) errors.acceptedAnswers = `Mỗi đáp án tối đa ${MAX_TEXT_ANSWER_LENGTH} ký tự`;
    else if (new Set(answers.map(normalizeTextAnswer)).size !== answers.length) errors.acceptedAnswers = 'Đáp án được chấp nhận bị lặp';
  } else {
    if (f.options.length < 2) errors.options = 'Cần ít nhất 2 lựa chọn';
    else if (f.options.some((o) => !o.text.trim())) errors.options = 'Nội dung các lựa chọn không được để trống';
    else if (!f.options.some((o) => o.correct)) errors.options = 'Chọn ít nhất một đáp án đúng';
  }
  if (!(f.points > 0) || f.points > 100) errors.points = 'Điểm phải lớn hơn 0 và không quá 100';
  return errors;
}

/** UC02A: biểu mẫu thêm/sửa câu trắc nghiệm hoặc điền vào chỗ trống. */
export function QuestionForm({
  initial,
  defaultSubject = '',
  filters,
  onSave,
  onCancel,
  saveLabel = 'Lưu'
}: {
  initial?: Question;
  defaultSubject?: string;
  filters?: QuestionFilters;
  onSave: (input: QuestionInput) => Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [subject, setSubject] = useState(initial?.subject ?? defaultSubject);
  const [chapter, setChapter] = useState(initial?.chapter ?? '');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'medium');
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'multiple_choice');
  const [acceptedAnswersText, setAcceptedAnswersText] = useState(initial?.type === 'fill_blank' ? initial.correctOptionIds.join('\n') : '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(initial?.imageDataUrl ?? null);
  const [imageError, setImageError] = useState('');
  const [imageReading, setImageReading] = useState(false);
  const imageInputId = useId();
  const imageReader = useRef<FileReader | null>(null);
  const [points, setPoints] = useState<number>(initial?.points ?? 1);
  const [options, setOptions] = useState<DraftOption[]>(
    initial?.type === 'multiple_choice'
      ? initial.options.map((o) => ({ text: o.text, correct: initial.correctOptionIds.includes(o.id) }))
      : [
          { text: '', correct: false },
          { text: '', correct: false },
          { text: '', correct: false },
          { text: '', correct: false }
        ]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<unknown>();

  useEffect(() => () => {
    if (imageReader.current?.readyState === FileReader.LOADING) imageReader.current.abort();
  }, []);

  const chooseImage = (file?: File) => {
    if (!file || busy || imageReader.current?.readyState === FileReader.LOADING) return;
    setImageError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageError('Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.');
      return;
    }
    if (!file.size || file.size > 2 * 1024 * 1024) {
      setImageError('Ảnh phải có dữ liệu và không vượt quá 2 MB.');
      return;
    }
    setImageReading(true);
    const reader = new FileReader();
    imageReader.current = reader;
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageDataUrl(reader.result);
      else setImageError('Không đọc được ảnh. Vui lòng chọn lại.');
      setImageReading(false);
    };
    reader.onerror = () => {
      setImageError('Không đọc được ảnh. Vui lòng chọn lại.');
      setImageReading(false);
    };
    reader.readAsDataURL(file);
  };

  const setOption = (i: number, patch: Partial<DraftOption>) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const submit = async () => {
    if (busy || imageReading || imageError) return;
    const acceptedAnswers = acceptedAnswersText.split(/\r?\n/).map((answer) => answer.trim()).filter(Boolean);
    const found = validateQuestionForm({ subject, content, options, points, type, acceptedAnswers });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setServerError(undefined);
    try {
      await onSave({
        subject: subject.trim(),
        chapter: chapter.trim(),
        topic: topic.trim(),
        difficulty,
        type,
        content: content.trim(),
        imageDataUrl,
        points,
        // Mã lựa chọn theo thứ tự A, B, C... để đồng nhất với bảng đáp án.
        options: type === 'fill_blank' ? [] : options.map((o, i) => ({ id: optionLetter(i), text: o.text.trim() })),
        correctOptionIds: type === 'fill_blank' ? acceptedAnswers : options.flatMap((o, i) => (o.correct ? [optionLetter(i)] : []))
      });
    } catch (err) {
      setServerError(err);
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ErrorAlert error={serverError} />
      <div className="form-grid">
        <Field label="Môn học" error={errors.subject}>
          <input type="text" list="qf-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <datalist id="qf-subjects">{filters?.subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Chương">
          <input type="text" list="qf-chapters" value={chapter} onChange={(e) => setChapter(e.target.value)} />
          <datalist id="qf-chapters">{filters?.chapters.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Chủ đề">
          <input type="text" list="qf-topics" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <datalist id="qf-topics">{filters?.topics.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Độ khó">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {difficultyLabel[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Loại câu">
          <select value={type} onChange={(e) => { setType(e.target.value as QuestionType); setErrors({}); }}>
            <option value="multiple_choice">Trắc nghiệm</option>
            <option value="fill_blank">Điền vào chỗ trống</option>
          </select>
        </Field>
        <Field label="Số điểm (barem)" error={errors.points}>
          <input type="number" min="0" max="100" step="0.25" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </Field>
        <Field label="Nội dung câu hỏi" error={errors.content} className="full">
          <textarea maxLength={5000} placeholder={type === 'fill_blank' ? 'Ví dụ: Thủ đô của Việt Nam là ___.' : undefined} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
        <div className="field full">
          <label className="field-label" htmlFor={imageInputId}>Hình ảnh minh họa (tùy chọn)</label>
          <input id={imageInputId} type="file" accept="image/png,image/jpeg,image/webp"
            disabled={busy || imageReading} aria-describedby={`${imageInputId}-help`}
            aria-invalid={!!imageError} onChange={(event) => {
              chooseImage(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }} />
          <span id={`${imageInputId}-help`} className="muted small">Mỗi câu một ảnh PNG, JPEG hoặc WebP, tối đa 2 MB và 12 triệu điểm ảnh.</span>
          {imageReading && <span role="status" className="muted small">Đang đọc ảnh...</span>}
          {imageError && <span role="alert" className="error-text">{imageError}</span>}
          <QuestionImage src={imageDataUrl} alt="Ảnh minh họa đang chọn" />
          {(imageDataUrl || imageError) && <div><Button small disabled={busy || imageReading} onClick={() => {
            setImageDataUrl(null);
            setImageError('');
          }}>Xóa ảnh</Button></div>}
        </div>
      </div>

      {type === 'fill_blank' ? (
        <Field label="Đáp án được chấp nhận (mỗi dòng một đáp án)" error={errors.acceptedAnswers}>
          <textarea value={acceptedAnswersText} onChange={(e) => setAcceptedAnswersText(e.target.value)} placeholder="Hà Nội" />
          <span className="muted small">
            Mỗi câu có một ô trả lời. Tối đa {MAX_ACCEPTED_ANSWERS} đáp án, mỗi đáp án tối đa {MAX_TEXT_ANSWER_LENGTH} ký tự.
            Không phân biệt chữ hoa/thường và khoảng trắng thừa; có phân biệt dấu tiếng Việt.
          </span>
        </Field>
      ) : <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <strong>Các lựa chọn</strong>
          <span className="muted small">Tích vào ô "Đúng" để đánh dấu đáp án đúng (có thể chọn nhiều)</span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {options.map((o, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <strong style={{ width: 20 }}>{optionLetter(i)}</strong>
              <input type="text" value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} placeholder={`Lựa chọn ${optionLetter(i)}`} />
              <label className="row" style={{ gap: 4, whiteSpace: 'nowrap' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={o.correct} onChange={(e) => setOption(i, { correct: e.target.checked })} />
                Đúng
              </label>
              <Button small disabled={options.length <= 2} onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Xóa lựa chọn ${optionLetter(i)}`}>
                ✕
              </Button>
            </div>
          ))}
        </div>
        {errors.options && <div className="field"><span className="error-text">{errors.options}</span></div>}
        <div style={{ marginTop: 8 }}>
          <Button small disabled={options.length >= MAX_OPTIONS} onClick={() => setOptions((prev) => [...prev, { text: '', correct: false }])}>
            + Thêm lựa chọn
          </Button>
        </div>
      </div>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
        <Button variant="primary" onClick={submit} disabled={busy || imageReading || !!imageError}>
          {busy ? 'Đang lưu...' : saveLabel}
        </Button>
      </div>
    </div>
  );
}
