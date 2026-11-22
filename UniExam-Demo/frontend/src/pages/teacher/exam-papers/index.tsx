import { useState } from 'react';
import { paperApi } from '../../../entities/exam/api';
import type { PaperListItem } from '../../../entities/exam/types';
import { PaperBuilder } from '../../../features/paper-builder';
import { difficultyLabel, formatDateTime, formatScore, optionLetter, useAsync } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorAlert, Modal, PageHeader, QuestionImage, Spinner } from '../../../shared/ui';

/** UC02B: trang "Đề thi". */
export default function ExamPapersPage() {
  const list = useAsync(() => paperApi.list(), [], 'papers:list');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PaperListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(undefined);
    try {
      await paperApi.remove(deleting.id);
      setDeleting(null);
      list.reload();
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Đề thi">
        <Button variant="primary" onClick={() => setCreating(true)}>
          Tạo đề thi
        </Button>
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      <ErrorAlert error={list.error} />
      <Card>
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.data && list.data.items.length === 0 ? (
          <div className="muted">Chưa có đề thi nào. Bấm "Tạo đề thi" để tự nhập câu hỏi hoặc chọn từ ngân hàng.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên đề</th>
                  <th>Môn học</th>
                  <th>Số câu</th>
                  <th>Tổng điểm</th>
                  <th>Ngày tạo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.title} {p.inUse && <Badge tone="blue">Đang dùng</Badge>}
                    </td>
                    <td>{p.subject}</td>
                    <td>{p.questionCount}</td>
                    <td>{formatScore(p.totalPoints)}</td>
                    <td>{formatDateTime(p.createdAt)}</td>
                    <td className="actions">
                      <Button small onClick={() => setViewing(p.id)}>Xem</Button>
                      <Button small variant="danger" disabled={p.inUse} title={p.inUse ? 'Đề đang được dùng trong kỳ thi' : undefined} onClick={() => setDeleting(p)}>
                        Xóa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <Modal title="Tạo đề thi" onClose={() => setCreating(false)} wide>
          <PaperBuilder
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              setNotice('Đã lưu đề thi. Đề được cố định và không đổi khi bạn sửa ngân hàng câu hỏi.');
              list.reload();
            }}
          />
        </Modal>
      )}
      {viewing && <PaperView id={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Xóa đề thi"
          danger
          confirmLabel="Xóa"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          message={<>Xóa đề "<strong>{deleting.title}</strong>"?</>}
        />
      )}
    </>
  );
}

function PaperView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading } = useAsync(() => paperApi.get(id), [id], 'papers:detail');
  return (
    <Modal title={data?.paper.title ?? 'Đề thi'} onClose={onClose} wide footer={<Button onClick={onClose}>Đóng</Button>}>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {data.paper.subject} · {data.questions.length} câu · {formatScore(data.totalPoints)} điểm
            </div>
            {data.questions.map((q) => (
              <div key={q.id} className="review-q">
                <div className="row between">
                  <strong>
                    Câu {q.position}. {q.content}
                  </strong>
                  <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                    {formatScore(q.points)} điểm · {difficultyLabel[q.difficulty]}
                  </span>
                </div>
                <QuestionImage src={q.imageDataUrl} alt={`Hình minh họa câu ${q.position}`} />
                {q.type === 'fill_blank' ? (
                  <div className="review-opt correct">Đáp án được chấp nhận: {q.correctOptionIds.join(' / ')}</div>
                ) : q.options.map((o, i) => (
                  <div key={o.id} className={`review-opt ${q.correctOptionIds.includes(o.id) ? 'correct' : ''}`}>
                    <strong>{optionLetter(i)}.</strong> {o.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </Modal>
  );
}
