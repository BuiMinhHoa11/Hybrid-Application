-- NULL giữ cách phát hành ngay của các kỳ thi đã có.
ALTER TABLE exams ADD COLUMN publish_at timestamptz;
ALTER TABLE exams ADD CONSTRAINT exams_publish_at_check
  CHECK (publish_at IS NULL OR publish_at <= start_time);
