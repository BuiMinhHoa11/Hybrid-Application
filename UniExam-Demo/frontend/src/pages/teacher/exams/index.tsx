import type { ExamStatus } from '@uniexam/contracts';
import { EXAM_STATUSES } from '@uniexam/contracts';
import { useState } from 'react';
import { teacherExamApi } from '../../../entities/exam/api';
import type { AudienceMember, TeacherExam } from '../../../entities/exam/types';
import { ExamForm } from '../../../features/exam-form';
import { errorMessage, examStatusLabel, formatDateTime, useAsync } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorAlert, Modal, PageHeader, Pagination, Spinner, type BadgeTone } from '../../../shared/ui';

const TONE: Record<ExamStatus, BadgeTone> = { draft: 'gray', published: 'blue', open: 'green', locked: 'amber', closed: 'gray' };

type Editing = { mode: 'new' } | { mode: 'edit'; exam: TeacherExam; audience: AudienceMember[] };

/** UC02C: trang "Kỳ thi". */
export default function ExamsPage() {
  const [status, setStatus] = useState<ExamStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useAsync(() => teacherExamApi.list({ status, page, pageSize: 15 }), [status, page]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string>();
  const [deleting, setDeleting] = useState<TeacherExam | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();

  const open = async (exam: TeacherExam) => {
    setOpening(true);
    setOpenError(undefined);
    try {
      const detail = await teacherExamApi.get(exam.id);
      setEditing({ mode: 'edit', exam: detail.exam, audience: detail.audience });
    } catch (err) {
      setOpenError(errorMessage(err));
    } finally {
      setOpening(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(undefined);
    try {
      await teacherExamApi.remove(deleting.id);
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
      <PageHeader title="Kỳ thi">
        <Button variant="primary" onClick={() => setEditing({ mode: 'new' })}>
          Tạo kỳ thi
        </Button>
      </PageHeader>
      {openError && <Alert>{openError}</Alert>}
      <Card>
        <div className="filters">
          <select value={status} onChange={(e) => { setStatus(e.target.value as ExamStatus | ''); setPage(1); }} aria-label="Lọc theo trạng thái">
            <option value="">Mọi trạng thái</option>
            {EXAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {examStatusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <ErrorAlert error={list.error} />
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.data && list.data.items.length === 0 ? (
          <div className="muted">Chưa có kỳ thi nào. Bấm "Tạo kỳ thi" để bắt đầu.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kỳ thi</th>
                    <th>Môn học</th>
                    <th>Công bố cho sinh viên</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>SV</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data?.items.map((e) => (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td>{e.subject}</td>
                      <td>{e.publishAt ? formatDateTime(e.publishAt) : 'Khi phát hành'}</td>
                      <td>{formatDateTime(e.startTime)}</td>
                      <td>{formatDateTime(e.endTime)}</td>
                      <td>{e.audienceCount ?? 0}</td>
                      <td>
                        <Badge tone={TONE[e.status]}>{examStatusLabel[e.status]}</Badge>
                        {e.status === 'published' && e.publishAt && Date.parse(e.publishAt) > Date.now() && <div className="muted small">Đã hẹn giờ công bố</div>}
                      </td>
                      <td className="actions">
                        <Button small disabled={opening} onClick={() => open(e)}>
                          {e.status === 'draft' ? 'Sửa' : 'Xem'}
                        </Button>
                        {e.status === 'draft' && (
                          <Button small variant="danger" onClick={() => setDeleting(e)}>
                            Xóa
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      {editing && (
        <Modal title={editing.mode === 'new' ? 'Tạo kỳ thi' : editing.exam.title} onClose={() => setEditing(null)} wide>
          <ExamForm
            exam={editing.mode === 'edit' ? editing.exam : undefined}
            audience={editing.mode === 'edit' ? editing.audience : undefined}
            onChanged={list.reload}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Xóa kỳ thi nháp"
          danger
          confirmLabel="Xóa"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          message={<>Xóa kỳ thi nháp "<strong>{deleting.title}</strong>"?</>}
        />
      )}
    </>
  );
}
