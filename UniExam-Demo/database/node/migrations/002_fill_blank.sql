-- Điền khuyết dùng options = [] và correct_option_ids chứa các đáp án văn bản được chấp nhận.
-- selected_option_ids (và snapshot bài nộp) chứa [] nếu bỏ trống hoặc [câu trả lời] nếu đã nhập.
-- Giữ nguyên dữ liệu và cấu trúc lưu bài của các câu trắc nghiệm đã có.
ALTER TABLE questions DROP CONSTRAINT questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('multiple_choice', 'fill_blank'));
