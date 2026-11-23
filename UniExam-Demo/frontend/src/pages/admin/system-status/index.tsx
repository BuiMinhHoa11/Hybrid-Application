import { useEffect } from 'react';
import { adminUserApi } from '../../../entities/user/api';
import { formatTime, useAsync } from '../../../shared/lib';
import { Alert, Badge, Button, Card, ErrorAlert, PageHeader, Spinner } from '../../../shared/ui';

const LABEL: Record<string, string> = {
  frontend: 'Frontend',
  'public-api': 'Public API',
  'private-api': 'Private API',
  'grading-worker': 'Grading Worker',
  database: 'Cơ sở dữ liệu'
};

/** UC03A: trang "Trạng thái hệ thống". */
export default function SystemStatusPage() {
  // Có tên bộ đệm: mở lại trang thấy ngay kết quả lần trước, rồi kiểm tra lại ở nền.
  const { data, error, loading, reload } = useAsync(() => adminUserApi.systemStatus(), [], 'admin:system-status');

  // Tự làm mới mỗi 30 giây, chỉ khi tab đang hiển thị (tránh dồn request lên VM private).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <>
      <PageHeader title="Trạng thái hệ thống">
        <Button onClick={reload} disabled={loading}>{loading && data ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</Button>
      </PageHeader>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <>
            {data.overall === 'ok' ? (
              <Alert kind="success">Mọi dịch vụ đang hoạt động.</Alert>
            ) : (
              <Alert>Có dịch vụ không hoạt động. Xem chi tiết bên dưới.</Alert>
            )}
            <div className="status-grid" style={{ marginTop: 16 }}>
              {data.services.map((s) => (
                <Card key={s.name} className={`status-card ${s.status}`}>
                  <div className="row between">
                    <strong>{LABEL[s.name] ?? s.name}</strong>
                    <Badge tone={s.status === 'up' ? 'green' : 'red'}>{s.status === 'up' ? 'Hoạt động' : 'Không hoạt động'}</Badge>
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    Phản hồi {s.latencyMs} ms
                  </div>
                  {s.detail && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>{s.detail}</div>}
                </Card>
              ))}
            </div>
            <p className="muted small">Kiểm tra lúc {formatTime(data.checkedAt)} · tự làm mới mỗi 30 giây</p>
          </>
        )
      )}
    </>
  );
}
