import type { Difficulty } from '@uniexam/contracts';
import { DIFFICULTIES } from '@uniexam/contracts';
import { useState } from 'react';
import { questionApi } from '../../../entities/question/api';
import type { Question, QuestionInput } from '../../../entities/question/types';
import { QuestionForm } from '../../../features/question-editor';
import { difficultyLabel, formatScore, useAsync } from '../../../shared/lib';
import { Badge, Button, Card, ConfirmDialog, ErrorAlert, Modal, PageHeader, Pagination, Spinner } from '../../../shared/ui';

const PAGE_SIZE = 15;

/** UC02A: trang "Ngân hàng câu hỏi". */
export default function QuestionBankPage() {
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();

  const filters = useAsync(() => questionApi.filters(), []);
  const list = useAsync(
    () => questionApi.list({ q, subject, chapter, topic, difficulty, page, pageSize: PAGE_SIZE }),
    [q, subject, chapter, topic, difficulty, page]
  );

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const save = async (input: QuestionInput) => {
    if (editing === 'new' || editing === null) await questionApi.create(input);
    else await questionApi.update(editing.id, input);
    setEditing(null);
    list.reload();
    filters.reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(undefined);
    try {
      await questionApi.remove(deleting.id);
      setDeleting(null);
      list.reload();
      filters.reload();
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const data = list.data;
  return (
    <>
      <PageHeader title="Ngân hàng câu hỏi">
        <Button variant="primary" onClick={() => setEditing('new')}>
          Thêm câu hỏi
        </Button>
      </PageHeader>

      <Card>
        <div className="filters">
          <input type="text" placeholder="Tìm kiếm nội dung câu hỏi..." value={q} onChange={(e) => change(setQ)(e.target.value)} aria-label="Tìm kiếm" />
          <select value={subject} onChange={(e) => change(setSubject)(e.target.value)} aria-label="Lọc theo môn">
            <option value="">Tất cả môn</option>
            {filters.data?.subjects.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={chapter} onChange={(e) => change(setChapter)(e.target.value)} aria-label="Lọc theo chương">
            <option value="">Tất cả chương</option>
            {filters.data?.chapters.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={topic} onChange={(e) => change(setTopic)(e.target.value)} aria-label="Lọc theo chủ đề">
            <option value="">Tất cả chủ đề</option>
            {filters.data?.topics.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => change(setDifficulty)(e.target.value as Difficulty | '')} aria-label="Lọc theo độ khó">
            <option value="">Mọi độ khó</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
          </select>
        </div>

        <ErrorAlert error={list.error} />
        {list.loading && !data ? (
          <Spinner />
        ) : data && data.items.length === 0 ? (
          <div className="muted">Không có câu hỏi nào. Bấm "Thêm câu hỏi" để bắt đầu.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nội dung</th>
                    <th>Môn</th>
                    <th>Chương / chủ đề</th>
                    <th>Độ khó</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ maxWidth: 380 }}>
                        {item.content.length > 120 ? `${item.content.slice(0, 120)}…` : item.content}
                        <div className="muted small">{item.type === 'fill_blank' ? 'Điền vào chỗ trống' : 'Trắc nghiệm'}</div>
                      </td>
                      <td>{item.subject}</td>
                      <td className="small">
                        {item.chapter || '—'}
                        <div className="muted">{item.topic}</div>
                      </td>
                      <td>
                        <Badge tone={item.difficulty === 'easy' ? 'green' : item.difficulty === 'hard' ? 'red' : 'amber'}>{difficultyLabel[item.difficulty]}</Badge>
                      </td>
                      <td>{formatScore(item.points)}</td>
                      <td className="actions">
                        <Button small onClick={() => setEditing(item)}>Sửa</Button>
                        <Button small variant="danger" onClick={() => setDeleting(item)}>Xóa</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      {editing && (
        <Modal title={editing === 'new' ? 'Thêm câu hỏi' : 'Sửa câu hỏi'} onClose={() => setEditing(null)} wide>
          <QuestionForm initial={editing === 'new' ? undefined : editing} filters={filters.data} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Xóa câu hỏi"
          danger
          confirmLabel="Xóa"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          message={
            <>
              Xóa câu hỏi "<strong>{deleting.content.slice(0, 80)}</strong>"? Các đề thi đã tạo từ câu hỏi này không bị ảnh hưởng.
            </>
          }
        />
      )}
    </>
  );
}
