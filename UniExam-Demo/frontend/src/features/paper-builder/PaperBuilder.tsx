import { useState } from 'react';
import { paperApi, type PaperAutoRule } from '../../entities/exam/api';
import { questionApi } from '../../entities/question/api';
import type { Question, QuestionInput } from '../../entities/question/types';
import { QuestionForm } from '../question-editor';
import { difficultyLabel, formatScore, useAsync } from '../../shared/lib';
import { Alert, Badge, Button, ErrorAlert, Field, Pagination, QuestionImage, Spinner } from '../../shared/ui';

/** Di chuyển phần tử trong mảng, không đổi mảng gốc. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** UC02B: tự nhập hoặc chọn câu hỏi từ ngân hàng, sắp xếp rồi lưu thành đề thi cố định. */
export function PaperBuilder({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Question[]>([]);
  const [q, setQ] = useState('');
  const [pickSubject, setPickSubject] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [localError, setLocalError] = useState<string>();
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoRules, setAutoRules] = useState<PaperAutoRule[]>([{ chapter: '', topic: '', difficulty: '', count: 5 }]);

  const filters = useAsync(() => questionApi.filters(), [], 'questions:filters');
  const bank = useAsync(() => questionApi.list({ q, subject: pickSubject, page, pageSize: 8 }), [q, pickSubject, page]);

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (question: Question) =>
    setSelected((prev) => (prev.some((s) => s.id === question.id) ? prev.filter((s) => s.id !== question.id) : [...prev, question]));
  const total = selected.reduce((sum, s) => sum + s.points, 0);

  const previewAuto = async () => {
    setLocalError(undefined);
    if (!subject.trim()) return setLocalError('Nhập môn học của đề để chọn câu tự động.');
    const requested = autoRules.reduce((sum, rule) => sum + rule.count, 0);
    if (autoRules.some((rule) => !Number.isInteger(rule.count) || rule.count < 1 || rule.count > 100) || requested > 300) {
      return setLocalError('Mỗi điều kiện chọn 1–100 câu, tổng cộng tối đa 300 câu.');
    }
    setBusy(true);
    setError(undefined);
    try {
      const preview = await paperApi.autoPreview({ subject: subject.trim(), rules: autoRules });
      setSelected(preview.questions);
      setNotice(`Đã chọn ${preview.questions.length} câu không trùng theo điều kiện. Bạn có thể sắp xếp hoặc thay đổi trước khi lưu đề.`);
      setAutoOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const createQuestion = async (input: QuestionInput) => {
    const question = await questionApi.create(input);
    setSelected((prev) => [...prev, question]);
    setSubject((prev) => prev.trim() ? prev : question.subject);
    setLocalError(undefined);
    setNotice('Đã lưu câu hỏi vào ngân hàng và thêm vào đề thi.');
    setCreatingQuestion(false);
    bank.reload();
    filters.reload();
  };

  const save = async () => {
    setLocalError(undefined);
    if (!title.trim()) return setLocalError('Nhập tên đề thi');
    if (!subject.trim()) return setLocalError('Nhập môn học');
    if (selected.length === 0) return setLocalError('Chọn ít nhất một câu hỏi');
    setBusy(true);
    setError(undefined);
    try {
      await paperApi.create({ title: title.trim(), subject: subject.trim(), description: description.trim(), questionIds: selected.map((s) => s.id) });
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (creatingQuestion) {
    return (
      <div className="stack">
        <h3>Nhập câu hỏi mới</h3>
        <p className="muted" style={{ margin: 0 }}>
          Chọn loại câu hỏi, nhập nội dung và đáp án đúng. Câu hỏi được lưu vào ngân hàng và tự thêm vào đề đang soạn.
        </p>
        <QuestionForm
          defaultSubject={subject.trim() || pickSubject.trim()}
          filters={filters.data}
          onSave={createQuestion}
          onCancel={() => setCreatingQuestion(false)}
          saveLabel="Lưu và thêm vào đề"
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <ErrorAlert error={error} />
      {notice && <Alert kind="success">{notice}</Alert>}
      {localError && <div className="alert error">{localError}</div>}
      <div className="form-grid">
        <Field label="Tên đề thi">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Môn học">
          <input type="text" list="pb-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <datalist id="pb-subjects">{filters.data?.subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Mô tả" className="full">
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <div className="row between">
        <span className="muted">Tự nhập câu hỏi của bạn hoặc chọn từ ngân hàng bên dưới.</span>
        <Button disabled={busy} onClick={() => setAutoOpen((open) => !open)}>Chọn câu tự động</Button>
        <Button variant="primary" disabled={busy} onClick={() => { setNotice(undefined); setCreatingQuestion(true); }}>
          + Nhập câu hỏi mới
        </Button>
      </div>

      {autoOpen && (
        <div className="stack" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <strong>Chọn câu theo điều kiện</strong>
          <span className="muted small">Hệ thống chọn ngẫu nhiên trong môn học ở trên. Bỏ trống chương, chủ đề hoặc độ khó để lấy mọi giá trị; mỗi câu chỉ xuất hiện một lần.</span>
          {autoRules.map((rule, index) => {
            const change = (patch: Partial<PaperAutoRule>) => setAutoRules((rules) => rules.map((item, i) => i === index ? { ...item, ...patch } : item));
            return <div className="form-grid" key={index}>
              <Field label={`Điều kiện ${index + 1}: Chương`}><input value={rule.chapter ?? ''} onChange={(e) => change({ chapter: e.target.value })} list="pb-chapters" /></Field>
              <Field label="Chủ đề"><input value={rule.topic ?? ''} onChange={(e) => change({ topic: e.target.value })} list="pb-topics" /></Field>
              <Field label="Độ khó"><select value={rule.difficulty ?? ''} onChange={(e) => change({ difficulty: e.target.value as PaperAutoRule['difficulty'] })}>
                <option value="">Mọi độ khó</option>
                <option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option>
              </select></Field>
              <Field label="Số câu"><input type="number" min={1} max={100} value={rule.count} onChange={(e) => change({ count: Number(e.target.value) })} /></Field>
              {autoRules.length > 1 && <div className="full"><Button small onClick={() => setAutoRules((rules) => rules.filter((_, i) => i !== index))}>Bỏ điều kiện {index + 1}</Button></div>}
            </div>;
          })}
          <datalist id="pb-chapters">{filters.data?.chapters.map((chapter) => <option key={chapter} value={chapter} />)}</datalist>
          <datalist id="pb-topics">{filters.data?.topics.map((topic) => <option key={topic} value={topic} />)}</datalist>
          <div className="row">
            <Button disabled={busy || autoRules.length >= 20} onClick={() => setAutoRules((rules) => [...rules, { chapter: '', topic: '', difficulty: '', count: 1 }])}>+ Thêm điều kiện</Button>
            <Button variant="primary" disabled={busy} onClick={previewAuto}>{busy ? 'Đang chọn...' : selected.length ? 'Thay các câu đã chọn theo điều kiện' : 'Chọn câu theo điều kiện'}</Button>
          </div>
        </div>
      )}

      <div className="form-grid" style={{ alignItems: 'start' }}>
        <div>
          <h3>Ngân hàng câu hỏi</h3>
          <div className="filters">
            <input type="text" placeholder="Tìm kiếm..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Tìm câu hỏi" />
            <input type="text" list="pb-subjects" placeholder="Nhập tên môn học..." value={pickSubject} onChange={(e) => { setPickSubject(e.target.value); setPage(1); }} aria-label="Lọc theo môn" />
          </div>
          <ErrorAlert error={bank.error} />
          {bank.loading && !bank.data ? (
            <Spinner />
          ) : (
            <>
              {bank.data?.items.map((item) => (
                <label key={item.id} className={`option ${isSelected(item.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={isSelected(item.id)} onChange={() => toggle(item)} />
                  <span>
                    {item.content.length > 100 ? `${item.content.slice(0, 100)}…` : item.content}
                    <QuestionImage src={item.imageDataUrl} thumbnail />
                    <div className="muted small">
                      {item.subject} · {item.type === 'fill_blank' ? 'Điền vào chỗ trống' : 'Trắc nghiệm'} · {item.chapter || '—'} · {difficultyLabel[item.difficulty]} · {formatScore(item.points)} điểm
                    </div>
                  </span>
                </label>
              ))}
              {bank.data && bank.data.items.length === 0 && <div className="muted">Không có câu hỏi phù hợp.</div>}
              {bank.data && <Pagination page={bank.data.page} pageSize={bank.data.pageSize} total={bank.data.total} onChange={setPage} />}
            </>
          )}
        </div>

        <div>
          <h3>
            Đề thi ({selected.length} câu · {formatScore(total)} điểm)
          </h3>
          {selected.length === 0 ? (
            <div className="muted">Chưa có câu hỏi. Bấm "Nhập câu hỏi mới" hoặc chọn từ ngân hàng.</div>
          ) : (
            selected.map((s, i) => (
              <div key={s.id} className="row" style={{ flexWrap: 'nowrap', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ width: 26 }}>{i + 1}.</strong>
                <span className="grow small">{s.content.length > 70 ? `${s.content.slice(0, 70)}…` : s.content}<QuestionImage src={s.imageDataUrl} thumbnail /></span>
                <Badge>{formatScore(s.points)}đ</Badge>
                <Button small disabled={i === 0} onClick={() => setSelected((p) => moveItem(p, i, i - 1))} aria-label="Lên">↑</Button>
                <Button small disabled={i === selected.length - 1} onClick={() => setSelected((p) => moveItem(p, i, i + 1))} aria-label="Xuống">↓</Button>
                <Button small onClick={() => toggle(s)} aria-label="Bỏ chọn">✕</Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={busy}>Hủy</Button>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? 'Đang lưu...' : 'Lưu đề thi'}
        </Button>
      </div>
    </div>
  );
}
