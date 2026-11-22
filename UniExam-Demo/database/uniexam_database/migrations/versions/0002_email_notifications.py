"""Hàng đợi email thông báo lịch thi cho sinh viên."""
from alembic import op

revision = "0002_email_notifications"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql("""
CREATE TABLE email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL DEFAULT 'schedule' CHECK (kind IN ('schedule')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  send_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, kind)
);
CREATE INDEX email_notifications_due_idx ON email_notifications (send_after) WHERE status = 'pending';
""")


def downgrade():
    op.get_bind().exec_driver_sql("DROP TABLE email_notifications")
