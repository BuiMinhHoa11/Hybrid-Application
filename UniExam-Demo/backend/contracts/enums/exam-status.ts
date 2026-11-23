/**
 * Vòng đời kỳ thi:
 *   draft -> published -> open -> locked -> closed
 * - draft:     nháp, chỉ giáo viên thấy
 * - published: đã phát hành, sinh viên thuộc đối tượng dự thi nhìn thấy, chưa đến giờ
 * - open:      đang trong khung giờ thi, cho phép bắt đầu làm bài (tự động)
 * - locked:    hết khung giờ, không cho bắt đầu mới, còn bài đang làm dở (tự động)
 * - closed:    mọi phiên thi đã nộp, kỳ thi đóng (tự động)
 * Việc công bố kết quả là cờ riêng (exams.results_published), không phải trạng thái.
 */
export const EXAM_STATUSES = ['draft', 'published', 'open', 'locked', 'closed'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
