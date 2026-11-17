-- UniExam: lược đồ ban đầu.
-- Quy ước: tên bảng số nhiều, snake_case; thời gian dùng timestamptz (UTC).

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL,
  full_name     text NOT NULL,
  email         text,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);

-- Ngân hàng câu hỏi (UC02A)
CREATE TABLE questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES users (id),
  subject            text NOT NULL,
  chapter            text NOT NULL DEFAULT '',
  topic              text NOT NULL DEFAULT '',
  difficulty         text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  type               text NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice')),
  content            text NOT NULL CHECK (length(btrim(content)) > 0),
  -- [{ "id": "A", "text": "..." }, ...]
  options            jsonb NOT NULL,
  correct_option_ids text[] NOT NULL CHECK (cardinality(correct_option_ids) > 0),
  points             numeric(6, 2) NOT NULL CHECK (points > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_owner_idx ON questions (owner_id);
CREATE INDEX questions_filter_idx ON questions (owner_id, subject, chapter, topic, difficulty);

-- Đề thi (UC02B): bản chụp cố định, sửa ngân hàng câu hỏi không làm đổi đề đã lưu.
CREATE TABLE exam_papers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users (id),
  title       text NOT NULL,
  subject     text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_papers_owner_idx ON exam_papers (owner_id);

CREATE TABLE exam_paper_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id           uuid NOT NULL REFERENCES exam_papers (id) ON DELETE CASCADE,
  position           integer NOT NULL CHECK (position > 0),
  question_id        uuid REFERENCES questions (id) ON DELETE SET NULL,
  type               text NOT NULL,
  content            text NOT NULL,
  options            jsonb NOT NULL,
  correct_option_ids text[] NOT NULL CHECK (cardinality(correct_option_ids) > 0),
  points             numeric(6, 2) NOT NULL CHECK (points > 0),
  chapter            text NOT NULL DEFAULT '',
  topic              text NOT NULL DEFAULT '',
  difficulty         text NOT NULL,
  UNIQUE (paper_id, position)
);

-- Kỳ thi (UC02C)
CREATE TABLE exams (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES users (id),
  title                text NOT NULL,
  subject              text NOT NULL,
  description          text NOT NULL DEFAULT '',
  format               text NOT NULL DEFAULT 'Trắc nghiệm trực tuyến',
  paper_id             uuid REFERENCES exam_papers (id),
  start_time           timestamptz NOT NULL,
  end_time             timestamptz NOT NULL,
  duration_minutes     integer NOT NULL CHECK (duration_minutes > 0),
  question_count       integer NOT NULL CHECK (question_count > 0),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'open', 'locked', 'closed')),
  results_published    boolean NOT NULL DEFAULT false,
  results_published_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exams_owner_idx ON exams (owner_id);
CREATE INDEX exams_status_idx ON exams (status, start_time);

CREATE TABLE exam_audience (
  exam_id    uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users (id),
  PRIMARY KEY (exam_id, student_id)
);
CREATE INDEX exam_audience_student_idx ON exam_audience (student_id);

-- Phiên làm bài (UC01B): mỗi sinh viên một phiên cho mỗi kỳ thi.
CREATE TABLE exam_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES exams (id),
  student_id    uuid NOT NULL REFERENCES users (id),
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  submitted_at  timestamptz,
  submit_reason text CHECK (submit_reason IN ('student', 'timeout')),
  UNIQUE (exam_id, student_id)
);
CREATE INDEX exam_sessions_active_idx ON exam_sessions (status, expires_at);

CREATE TABLE answers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  question_id         uuid NOT NULL REFERENCES exam_paper_questions (id),
  selected_option_ids text[] NOT NULL DEFAULT '{}',
  flagged             boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

-- Bài nộp (UC01C): đồng thời đóng vai trò hàng đợi chấm bài (UC04A).
CREATE TABLE submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL UNIQUE REFERENCES exam_sessions (id),
  exam_id          uuid NOT NULL REFERENCES exams (id),
  student_id       uuid NOT NULL REFERENCES users (id),
  status           text NOT NULL DEFAULT 'pending_grading' CHECK (status IN ('pending_grading', 'grading', 'graded', 'failed')),
  -- [{ "questionId": "...", "selectedOptionIds": ["A"] }]
  answers_snapshot jsonb NOT NULL DEFAULT '[]',
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  graded_at        timestamptz,
  attempts         integer NOT NULL DEFAULT 0,
  fail_reason      text
);
CREATE INDEX submissions_queue_idx ON submissions (status, submitted_at);
CREATE INDEX submissions_exam_idx ON submissions (exam_id);
CREATE INDEX submissions_student_idx ON submissions (student_id);

CREATE TABLE grading_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES submissions (id) ON DELETE CASCADE,
  score         numeric(8, 2) NOT NULL CHECK (score >= 0),
  max_score     numeric(8, 2) NOT NULL CHECK (max_score >= 0),
  -- [{ "questionId", "selectedOptionIds", "correctOptionIds", "correct", "earned", "max" }]
  details       jsonb NOT NULL DEFAULT '[]',
  graded_by     text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
