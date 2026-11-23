"""Persist browser fullscreen observations for teacher review."""
from alembic import op

revision = "0003_fullscreen_events"
down_revision = "0002_email_notifications"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql("""
CREATE TABLE exam_session_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  type varchar(30) NOT NULL CHECK (type IN ('fullscreen_enter', 'fullscreen_exit')),
  client_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX exam_session_events_session_idx ON exam_session_events(session_id, client_time, received_at);
CREATE INDEX exam_session_events_exits_idx ON exam_session_events(session_id) WHERE type='fullscreen_exit';
""")


def downgrade():
    op.drop_table("exam_session_events")
