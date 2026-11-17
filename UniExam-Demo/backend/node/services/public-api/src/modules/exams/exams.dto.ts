import { z } from 'zod';
import { EXAM_STATUSES } from '@uniexam/contracts';
import { optionalText, pagination } from '../common';

const dateTime = z
  .string({ required_error: 'Chọn thời gian' })
  .datetime({ offset: true, message: 'Thời gian không hợp lệ (cần định dạng ISO 8601)' })
  .transform((s) => new Date(s));

const base = z.object({
  title: z.string().trim().min(1, 'Nhập tên kỳ thi').max(200),
  subject: z.string().trim().min(1, 'Nhập môn học').max(200),
  description: z.string().trim().max(2000).default(''),
  format: z.string().trim().min(1).max(100).default('Trắc nghiệm trực tuyến'),
  paperId: z.string().uuid().nullable().optional(),
  publishAt: dateTime.nullable().default(null),
  startTime: dateTime,
  endTime: dateTime,
  durationMinutes: z.coerce.number().int().min(1, 'Thời lượng tối thiểu 1 phút').max(600, 'Thời lượng tối đa 600 phút'),
  questionCount: z.coerce.number().int().min(1, 'Số câu tối thiểu là 1').max(500)
});

/** "Lưu nháp": chỉ kiểm tra cơ bản, kiểm tra đầy đủ nằm ở bước "Kiểm tra" và "Phát hành". */
export const createExamBody = base.refine((b) => b.endTime > b.startTime, {
  path: ['endTime'],
  message: 'Thời gian kết thúc phải sau thời gian bắt đầu'
}).refine((b) => b.publishAt === null || b.publishAt <= b.startTime, {
  path: ['publishAt'],
  message: 'Giờ công bố phải trước hoặc bằng giờ bắt đầu làm bài'
});
export type CreateExamBody = z.infer<typeof createExamBody>;

/** Cập nhật từng phần; chỉ áp dụng cho kỳ thi nháp (xem service). */
export const updateExamBody = z
  .object({
    title: base.shape.title,
    subject: base.shape.subject,
    description: z.string().trim().max(2000),
    format: base.shape.format,
    paperId: base.shape.paperId,
    publishAt: dateTime.nullable(),
    startTime: dateTime,
    endTime: dateTime,
    durationMinutes: base.shape.durationMinutes,
    questionCount: base.shape.questionCount
  })
  .partial();
export type UpdateExamBody = z.infer<typeof updateExamBody>;

/** Đối tượng dự thi: danh sách thay thế toàn bộ, nhận cả id lẫn username (mã sinh viên). */
export const audienceBody = z.object({
  studentIds: z.array(z.string().uuid()).max(5000).default([]),
  usernames: z.array(z.string().trim().min(1).max(100)).max(5000).default([])
});
export type AudienceBody = z.infer<typeof audienceBody>;

export const listExamsQuery = z.object({
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(EXAM_STATUSES).optional()),
  q: optionalText,
  ...pagination
});
export type ListExamsQuery = z.infer<typeof listExamsQuery>;
