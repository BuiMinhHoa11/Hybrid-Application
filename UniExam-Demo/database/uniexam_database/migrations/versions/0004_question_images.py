from alembic import op

revision = "0004_question_images"
down_revision = "0003_fullscreen_events"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TABLE questions ADD COLUMN image_data_url TEXT")
    op.execute(
        "ALTER TABLE exam_paper_questions ADD COLUMN image_data_url TEXT"
    )

def downgrade():
    op.execute(
        "ALTER TABLE exam_paper_questions DROP COLUMN image_data_url"
    )
    op.execute("ALTER TABLE questions DROP COLUMN image_data_url")
