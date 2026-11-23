"""Initial Python schema, for a NEW PostgreSQL database only."""
from alembic import op
from uniexam_database import schema_sql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql(schema_sql())


def downgrade():
    raise RuntimeError("Baseline contains exam data; restore a verified backup instead of dropping it automatically")
