export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ExamValidationInput {
  exam: {
    title: string;
    subject: string;
    paperId: string | null;
    publishAt: Date | null;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    questionCount: number;
  };
  /** null khi chưa chọn đề hoặc đề không còn tồn tại */
  paper: { questionCount: number; incompleteCount: number } | null;
  audienceCount: number;
  now: Date;
}

/**
 * Bước "Kiểm tra" của UC02C: đề, đáp án, thời gian và đối tượng dự thi.
 * Trả về danh sách lỗi; rỗng nghĩa là có thể phát hành.
 */
export function validateExam({ exam, paper, audienceCount, now }: ExamValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!exam.title.trim()) add('title', 'Chưa nhập tên kỳ thi');
  if (!exam.subject.trim()) add('subject', 'Chưa nhập môn học');

  if (!exam.paperId || !paper) {
    add('paperId', 'Chưa chọn đề thi');
  } else {
    if (paper.questionCount === 0) add('paperId', 'Đề thi không có câu hỏi nào');
    else if (paper.questionCount !== exam.questionCount) {
      add('questionCount', `Số câu hỏi của kỳ thi (${exam.questionCount}) khác số câu trong đề (${paper.questionCount})`);
    }
    if (paper.incompleteCount > 0) add('paperId', `Đề thi có ${paper.incompleteCount} câu thiếu đáp án đúng hoặc điểm`);
  }

  if (exam.startTime.getTime() <= now.getTime()) add('startTime', 'Thời gian bắt đầu phải nằm trong tương lai');
  if (exam.publishAt) {
    if (exam.publishAt <= now) add('publishAt', 'Giờ công bố đã qua. Chọn giờ mới hoặc công bố ngay khi phát hành.');
    if (exam.publishAt > exam.startTime) add('publishAt', 'Giờ công bố phải trước hoặc bằng giờ bắt đầu làm bài');
  }
  if (exam.endTime.getTime() <= exam.startTime.getTime()) {
    add('endTime', 'Thời gian kết thúc phải sau thời gian bắt đầu');
  } else {
    const windowMinutes = (exam.endTime.getTime() - exam.startTime.getTime()) / 60_000;
    if (windowMinutes < exam.durationMinutes) {
      add('durationMinutes', `Khung giờ thi (${Math.floor(windowMinutes)} phút) ngắn hơn thời lượng làm bài (${exam.durationMinutes} phút)`);
    }
  }

  if (audienceCount === 0) add('audience', 'Chưa có sinh viên nào thuộc đối tượng dự thi');
  return issues;
}
