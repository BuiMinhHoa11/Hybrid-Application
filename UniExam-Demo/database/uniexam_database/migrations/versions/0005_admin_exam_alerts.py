"""Durable admin alerts and independent read receipts for fullscreen exits."""
from alembic import op

revision = "0005_admin_exam_alerts"
down_revision = "0004_question_images"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql("""
CREATE TABLE admin_exam_alerts (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE REFERENCES exam_session_events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin_exam_alert_reads (
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id bigint NOT NULL REFERENCES admin_exam_alerts(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (admin_id, alert_id)
);
""")


def downgrade():
    op.drop_table("admin_exam_alert_reads")
    op.drop_table("admin_exam_alerts")
