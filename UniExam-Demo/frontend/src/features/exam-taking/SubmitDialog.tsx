import { ConfirmDialog } from '../../shared/ui';

/** UC01C: hộp thoại xác nhận kèm số câu đã trả lời và chưa trả lời. */
export function SubmitDialog({
  counts,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  counts: { total: number; answered: number; unanswered: number; flagged: number };
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      title="Xác nhận nộp bài"
      confirmLabel="Xác nhận nộp bài"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <div className="stack">
          <div>
            Đã trả lời <strong>{counts.answered}</strong>/{counts.total} câu, chưa trả lời{' '}
            <strong style={{ color: counts.unanswered ? 'var(--danger)' : undefined }}>{counts.unanswered}</strong> câu
            {counts.flagged > 0 && <>, còn <strong>{counts.flagged}</strong> câu đang đánh dấu xem lại</>}.
          </div>
          <div className="muted">Sau khi nộp, bài được chốt và bạn không thể chỉnh sửa nữa.</div>
        </div>
      }
    />
  );
}
