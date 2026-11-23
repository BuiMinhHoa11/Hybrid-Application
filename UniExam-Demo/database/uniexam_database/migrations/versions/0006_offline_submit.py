"""Bài nộp ngoại tuyến: sinh viên mất mạng vẫn làm hết bài, máy tự gửi bài khi có mạng lại."""
from alembic import op

revision = "0006_offline_submit"
down_revision = "0005_admin_exam_alerts"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql("""
-- Thêm lý do nộp 'offline'. Tên ràng buộc cũ có thể khác nhau tùy cách tạo database,
-- nên tìm theo nội dung: ràng buộc chỉ nói về submit_reason (không đụng ràng buộc có status).
-- Không dùng ký tự phần trăm: psycopg hiểu nó là chỗ điền tham số và báo lỗi.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'exam_sessions'::regclass AND contype = 'c'
             AND position('submit_reason' in pg_get_constraintdef(oid)) > 0
             AND position('status' in pg_get_constraintdef(oid)) = 0
  LOOP
    EXECUTE 'ALTER TABLE exam_sessions DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_submit_reason_check
  CHECK (submit_reason IN ('student', 'timeout', 'offline'));

-- Thông tin để giáo viên soát bài nộp ngoại tuyến.
ALTER TABLE submissions
  ADD COLUMN offline_synced_at timestamptz,
  ADD COLUMN offline_seconds integer CHECK (offline_seconds IS NULL OR offline_seconds >= 0),
  ADD COLUMN offline_late_seconds integer CHECK (offline_late_seconds IS NULL OR offline_late_seconds >= 0);
""")


def downgrade():
    op.get_bind().exec_driver_sql("""
ALTER TABLE submissions DROP COLUMN offline_late_seconds, DROP COLUMN offline_seconds, DROP COLUMN offline_synced_at;
UPDATE exam_sessions SET submit_reason = 'timeout' WHERE submit_reason = 'offline';
ALTER TABLE exam_sessions DROP CONSTRAINT exam_sessions_submit_reason_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_submit_reason_check CHECK (submit_reason IN ('student', 'timeout'));
""")
