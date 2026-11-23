import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { alertTime, useAdminAlerts } from '../../../features/admin-exam-alerts';
import { Alert, Badge, Button, Card, ErrorAlert, PageHeader } from '../../../shared/ui';

export default function ExamAlertsPage() {
  const state = useAdminAlerts();
  const [view, setView] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');
  const tabs = useId();
  if (!state) return null;
  const { snapshot, connection, busy, error, read } = state;
  const matches = (item: { username: string; fullName: string; examTitle: string }) =>
    `${item.username} ${item.fullName} ${item.examTitle}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
  const active = snapshot.activeSessions.filter(matches);
  const history = snapshot.items.filter(matches);
  const connected = connection === 'connected';

  return <>
    <PageHeader title="Cảnh báo thi">
      <Badge tone={snapshot.activeSessions.length ? 'red' : 'green'}>{snapshot.activeSessions.length} tài khoản đang ngoài toàn màn hình</Badge>
    </PageHeader>
    <div className="muted small" role="status" style={{ marginBottom: 16 }}>
      {connected ? 'Đang cập nhật trực tiếp' : connection === 'forbidden' ? 'Phiên quản trị không còn hợp lệ' : connection === 'reconnecting' ? 'Mất kết nối. Đang kết nối lại; trạng thái hiển thị có thể chưa được cập nhật.' : 'Đang kết nối cảnh báo...'}
    </div>
    <ErrorAlert error={error} />
    <Card>
      <div className="exam-alert-tabs" role="tablist" aria-label="Loại cảnh báo">
        <button type="button" role="tab" id={`${tabs}-active`} aria-controls={`${tabs}-content`} aria-selected={view === 'active'} onClick={() => setView('active')}>
          Đang ngoài toàn màn hình <Badge tone={snapshot.activeSessions.length ? 'red' : 'gray'}>{snapshot.activeSessions.length}</Badge>
        </button>
        <button type="button" role="tab" id={`${tabs}-history`} aria-controls={`${tabs}-content`} aria-selected={view === 'history'} onClick={() => setView('history')}>
          Lịch sử cảnh báo {snapshot.unreadCount > 0 && <Badge tone="amber">{snapshot.unreadCount} chưa đọc</Badge>}
        </button>
      </div>
      <div className="row between" style={{ margin: '18px 0' }}>
        <input className="exam-alert-search" type="text" value={search} onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm tài khoản cảnh báo" placeholder="Tìm tài khoản, họ tên hoặc kỳ thi..." />
        {view === 'history' && snapshot.unreadCount > 0 && <Button small disabled={busy} onClick={() => void read()}>Đánh dấu tất cả đã đọc ({snapshot.unreadCount})</Button>}
      </div>
      <div role="tabpanel" id={`${tabs}-content`} aria-labelledby={`${tabs}-${view}`}>
        {view === 'active' ? <>
          <Alert kind="info">Danh sách cập nhật theo sự kiện máy chủ nhận được. Tài khoản tự rời danh sách khi quay lại toàn màn hình, nộp bài hoặc hết giờ thi.</Alert>
          {!active.length ? <p className="muted">{search.trim() ? 'Không có tài khoản phù hợp.' : connected ? 'Hiện không ghi nhận thí sinh đang ở ngoài chế độ toàn màn hình.' : 'Đang chờ dữ liệu cảnh báo...'}</p> :
            <div className="table-wrap" style={{ marginTop: 16 }}><table>
              <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Kỳ thi</th><th>Thoát lúc</th><th>Số lần thoát</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>{active.map((item) => <tr key={item.sessionId}>
                <td><strong>{item.username}</strong></td><td>{item.fullName}</td><td>{item.examTitle}</td>
                <td className="small">{alertTime(item.exitedAt)}<div className="muted" title="Thời điểm máy chủ nhận sự kiện">Nhận: {alertTime(item.receivedAt)}</div></td>
                <td>{item.exitCount}</td><td><Badge tone="red">Đang ngoài toàn màn hình</Badge></td>
                <td><Link to={`/teacher/exam-results/${item.examId}`}>Xem nhật ký</Link></td>
              </tr>)}</tbody>
            </table></div>}
        </> : <>
          <div className="muted small">50 lần thoát gần nhất. Đánh dấu đã đọc không thay đổi trạng thái toàn màn hình của thí sinh.</div>
          {!history.length ? <p className="muted">{search.trim() ? 'Không có cảnh báo phù hợp.' : 'Chưa có cảnh báo.'}</p> :
            <div className="table-wrap" style={{ marginTop: 16 }}><table>
              <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Kỳ thi</th><th>Thời điểm thoát</th><th>Trạng thái hiện tại</th><th>Thông báo</th><th /></tr></thead>
              <tbody>{history.map((item) => <tr key={item.id} className={item.readAt ? '' : 'exam-alert-unread'}>
                <td><strong>{item.username}</strong></td><td>{item.fullName}</td><td>{item.examTitle}</td><td className="small">{alertTime(item.clientTime)}</td>
                <td><Badge tone={item.currentStatus === 'outside' ? 'red' : item.currentStatus === 'fullscreen' ? 'green' : 'gray'}>
                  {item.currentStatus === 'outside' ? 'Đang ngoài toàn màn hình' : item.currentStatus === 'fullscreen' ? 'Đã quay lại toàn màn hình' : 'Đã kết thúc bài thi'}
                </Badge></td>
                <td>{item.readAt ? <span className="muted small">Đã đọc</span> : <Button small disabled={busy} onClick={() => void read(item.id)}>Đã đọc</Button>}</td>
                <td><Link to={`/teacher/exam-results/${item.examId}`}>Xem nhật ký</Link></td>
              </tr>)}</tbody>
            </table></div>}
        </>}
      </div>
    </Card>
  </>;
}
