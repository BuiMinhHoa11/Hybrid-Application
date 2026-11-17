-- UniExam: de xuat database cho backend Python/FastAPI, PostgreSQL 16+.
-- Day la schema khoi tao cho database/schema MOI, khong phai migration cua ung dung hien tai.
-- Chay trong mot transaction cua Alembic hoac psql --single-transaction.
-- Khong chua du lieu tai khoan, mat khau mau hay lenh xoa database.

-- Kiem tra du lieu cau hoi trong cung mot hang; dung chung cho ngan hang va ban chup de thi.
CREATE FUNCTION question_payload_valid(qtype text, opts jsonb, correct_ids text[], accepted text[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  item jsonb;
  token text;
  normalized text;
  ids text[] := '{}';
  seen text[] := '{}';
BEGIN
  IF qtype IS NULL OR opts IS NULL OR correct_ids IS NULL OR accepted IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(opts) <> 'array' OR array_ndims(correct_ids) > 1 OR array_ndims(accepted) > 1 THEN RETURN false; END IF;
  IF qtype = 'multiple_choice' THEN
    IF jsonb_array_length(opts) NOT BETWEEN 2 AND 8 OR cardinality(correct_ids) NOT BETWEEN 1 AND 8
       OR cardinality(accepted) <> 0 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(opts) LOOP
      IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
         OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      token := item->>'id';
      IF token !~ '^[A-Za-z0-9_-]{1,10}$' OR length(item->>'text') > 1000
         OR length(btrim(regexp_replace(item->>'text', '[[:space:]]+', ' ', 'g'))) = 0
         OR token = ANY(ids) THEN RETURN false; END IF;
      ids := array_append(ids, token);
    END LOOP;
    FOREACH token IN ARRAY correct_ids LOOP
      IF token IS NULL OR NOT (token = ANY(ids)) OR token = ANY(seen) THEN RETURN false; END IF;
      seen := array_append(seen, token);
    END LOOP;
    RETURN true;
  ELSIF qtype = 'fill_blank' THEN
    IF jsonb_array_length(opts) <> 0 OR cardinality(correct_ids) <> 0
       OR cardinality(accepted) NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
    FOREACH token IN ARRAY accepted LOOP
      IF token IS NULL OR length(token) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
      normalized := lower(btrim(regexp_replace(token, '[[:space:]]+', ' ', 'g')));
      IF normalized = '' OR normalized = ANY(seen) THEN RETURN false; END IF;
      seen := array_append(seen, normalized);
    END LOOP;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(100) NOT NULL CHECK (length(btrim(username)) > 0 AND username = btrim(username)),
  full_name varchar(200) NOT NULL CHECK (length(btrim(full_name)) > 0),
  email varchar(254),
  password_hash text NOT NULL CHECK (length(password_hash) > 0),
  role varchar(20) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NULL OR (length(btrim(email)) > 0 AND email = btrim(email)))
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject varchar(200) NOT NULL CHECK (length(btrim(subject)) > 0),
  chapter varchar(200) NOT NULL DEFAULT '',
  topic varchar(200) NOT NULL DEFAULT '',
  difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  type varchar(30) NOT NULL CHECK (type IN ('multiple_choice', 'fill_blank')),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 5000),
  options jsonb NOT NULL DEFAULT '[]',
  correct_option_ids text[] NOT NULL DEFAULT '{}',
  accepted_answers text[] NOT NULL DEFAULT '{}',
  points numeric(6,2) NOT NULL CHECK (points > 0 AND points <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_payload_check CHECK (question_payload_valid(type, options, correct_option_ids, accepted_answers))
);
CREATE INDEX questions_owner_filter_idx ON questions (owner_id, subject, difficulty);

CREATE TABLE exam_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  subject varchar(200) NOT NULL CHECK (length(btrim(subject)) > 0),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_papers_owner_idx ON exam_papers (owner_id);

-- Luu ban chup noi dung, lua chon, dap an va diem; khong doc dap an tu questions khi cham.
CREATE TABLE exam_paper_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id) ON DELETE SET NULL,
  position integer NOT NULL CHECK (position > 0),
  type varchar(30) NOT NULL CHECK (type IN ('multiple_choice', 'fill_blank')),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 5000),
  options jsonb NOT NULL DEFAULT '[]',
  correct_option_ids text[] NOT NULL DEFAULT '{}',
  accepted_answers text[] NOT NULL DEFAULT '{}',
  points numeric(6,2) NOT NULL CHECK (points > 0 AND points <= 100),
  chapter varchar(200) NOT NULL DEFAULT '',
  topic varchar(200) NOT NULL DEFAULT '',
  difficulty varchar(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  UNIQUE (paper_id, position),
  UNIQUE (paper_id, question_id),
  UNIQUE (id, paper_id),
  CONSTRAINT paper_questions_payload_check CHECK (question_payload_valid(type, options, correct_option_ids, accepted_answers))
);
CREATE INDEX paper_questions_source_idx ON exam_paper_questions (question_id);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  paper_id uuid REFERENCES exam_papers(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  subject varchar(200) NOT NULL CHECK (length(btrim(subject)) > 0),
  description text NOT NULL DEFAULT '',
  publish_at timestamptz,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  question_count integer NOT NULL CHECK (question_count BETWEEN 1 AND 500),
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'open', 'locked', 'closed')),
  results_published boolean NOT NULL DEFAULT false,
  results_published_at timestamptz,
  results_published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, paper_id),
  CHECK (end_time > start_time),
  CHECK (publish_at IS NULL OR publish_at <= start_time),
  CHECK (status = 'draft' OR paper_id IS NOT NULL),
  CHECK (
    (NOT results_published AND results_published_at IS NULL AND results_published_by IS NULL)
    OR (results_published AND status = 'closed' AND results_published_at IS NOT NULL AND results_published_by IS NOT NULL)
  )
);
CREATE INDEX exams_owner_start_idx ON exams (owner_id, start_time DESC);
CREATE INDEX exams_lifecycle_idx ON exams (status, start_time, end_time);
CREATE INDEX exams_publish_idx ON exams (publish_at) WHERE status IN ('published', 'open');
CREATE INDEX exams_paper_idx ON exams (paper_id);

CREATE TABLE exam_audience (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, student_id)
);
CREATE INDEX exam_audience_student_idx ON exam_audience (student_id, exam_id);

CREATE TABLE exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  paper_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  submit_reason varchar(20) CHECK (submit_reason IN ('student', 'timeout')),
  UNIQUE (exam_id, student_id),
  UNIQUE (id, paper_id),
  UNIQUE (id, exam_id, student_id),
  FOREIGN KEY (exam_id, student_id) REFERENCES exam_audience(exam_id, student_id) ON DELETE RESTRICT,
  FOREIGN KEY (exam_id, paper_id) REFERENCES exams(id, paper_id) ON DELETE RESTRICT,
  CHECK (expires_at > started_at),
  CHECK (submitted_at IS NULL OR submitted_at >= started_at),
  CHECK (
    (status = 'in_progress' AND submitted_at IS NULL AND submit_reason IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND submit_reason IS NOT NULL)
  )
);
CREATE INDEX exam_sessions_expiry_idx ON exam_sessions (expires_at) WHERE status = 'in_progress';
CREATE INDEX exam_sessions_student_idx ON exam_sessions (student_id, started_at DESC);

CREATE TABLE answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  paper_id uuid NOT NULL,
  question_id uuid NOT NULL,
  selected_option_ids text[] NOT NULL DEFAULT '{}',
  text_answer varchar(500),
  flagged boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id),
  FOREIGN KEY (session_id, paper_id) REFERENCES exam_sessions(id, paper_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, paper_id) REFERENCES exam_paper_questions(id, paper_id) ON DELETE RESTRICT,
  CHECK (array_ndims(selected_option_ids) IS NULL OR array_ndims(selected_option_ids) = 1),
  CHECK (array_position(selected_option_ids, NULL) IS NULL),
  CHECK (cardinality(selected_option_ids) <= 8),
  CHECK (text_answer IS NULL OR cardinality(selected_option_ids) = 0)
);
CREATE INDEX answers_question_paper_idx ON answers (question_id, paper_id);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending_grading' CHECK (status IN ('pending_grading', 'grading', 'graded', 'failed')),
  answers_snapshot jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(answers_snapshot) = 'array'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  graded_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  fail_reason text,
  FOREIGN KEY (session_id, exam_id, student_id) REFERENCES exam_sessions(id, exam_id, student_id) ON DELETE RESTRICT,
  CHECK (status <> 'graded' OR graded_at IS NOT NULL)
);
CREATE INDEX submissions_queue_idx ON submissions (status, submitted_at) WHERE status IN ('pending_grading', 'grading');
CREATE INDEX submissions_claimed_idx ON submissions (claimed_at) WHERE status = 'grading';
CREATE INDEX submissions_exam_idx ON submissions (exam_id);
CREATE INDEX submissions_student_idx ON submissions (student_id);

CREATE TABLE grading_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE RESTRICT,
  score numeric(8,2) NOT NULL,
  max_score numeric(8,2) NOT NULL,
  details jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(details) = 'array'),
  graded_by varchar(100) NOT NULL CHECK (length(btrim(graded_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (score <> 'NaN'::numeric AND max_score <> 'NaN'::numeric
         AND max_score > 0 AND score >= 0 AND score <= max_score)
);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER questions_touch BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER exam_papers_touch BEFORE UPDATE ON exam_papers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER exams_touch BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER answers_touch BEFORE UPDATE ON answers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
