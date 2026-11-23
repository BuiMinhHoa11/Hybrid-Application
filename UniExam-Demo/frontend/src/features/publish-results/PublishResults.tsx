import { useState } from 'react';
import { examResultApi } from '../../entities/submission/api';
import { Button, ConfirmDialog } from '../../shared/ui';

/** UC02D: nút "Công bố kết quả" và bước "Xác nhận" trước khi sinh viên được xem điểm. */
export function PublishResults({
  examId,
  published,
  blockedReason,
  early = false,
  onPublished
}: {
  examId: string;
  published: boolean;
  /** Lý do chưa công bố được (kỳ thi chưa đóng, còn bài chưa chấm...). */
  blockedReason?: string;
  early?: boolean;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  if (published) return <span className="badge green">Đã công bố kết quả</span>;

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await examResultApi.publish(examId);
      setOpen(false);
      onPublished();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="primary" disabled={!!blockedReason} title={blockedReason} onClick={() => setOpen(true)}>
        Công bố kết quả
      </Button>
      {open && (
        <ConfirmDialog
          title="Công bố kết quả"
          confirmLabel="Xác nhận"
          busy={busy}
          error={error}
          onConfirm={confirm}
          onCancel={() => setOpen(false)}
          message={early
            ? 'Tất cả thí sinh đã nộp và chấm xong. Công bố ngay sẽ đóng kỳ thi trước giờ kết thúc và cho sinh viên xem điểm, đáp án. Bạn có thể hủy để công bố sau. Sau khi công bố không thể thu hồi.'
            : 'Sau khi công bố, mọi sinh viên của kỳ thi này sẽ xem được điểm và đáp án. Bạn có thể hủy để công bố sau. Sau khi công bố không thể thu hồi.'}
        />
      )}
    </>
  );
}
