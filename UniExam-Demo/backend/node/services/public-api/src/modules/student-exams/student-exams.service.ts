import { notFound } from '@uniexam/observability';
import type { StudentExamDto } from './student-exams.dto';
import * as repo from './student-exams.repository';
import type { StudentExamRow } from './student-exams.repository';

export function toDto(row: StudentExamRow, now: Date, withDescription: boolean): StudentExamDto {
  const start = row.startTime.getTime();
  const end = row.endTime.getTime();
  const t = now.getTime();
  const availability = t < start ? 'upcoming' : t < end ? 'open' : 'ended';
  const startable = availability === 'open' && (row.status === 'published' || row.status === 'open');
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    ...(withDescription ? { description: row.description } : {}),
    format: row.format,
    startTime: row.startTime,
    endTime: row.endTime,
    durationMinutes: row.durationMinutes,
    questionCount: row.questionCount,
    status: row.status,
    availability,
    sessionId: row.sessionId,
    sessionStatus: row.sessionStatus,
    canStart: startable && row.sessionStatus !== 'submitted'
  };
}

export async function list(studentId: string) {
  const now = new Date();
  const rows = await repo.listForStudent(studentId);
  return { serverTime: now, items: rows.map((r) => toDto(r, now, false)) };
}

export async function detail(studentId: string, examId: string) {
  const row = await repo.findForStudent(studentId, examId);
  // Không phân biệt "không tồn tại" và "không thuộc đối tượng dự thi" để không lộ kỳ thi.
  if (!row) throw notFound('Không tìm thấy kỳ thi hoặc bạn không thuộc đối tượng dự thi');
  const now = new Date();
  return { serverTime: now, exam: toDto(row, now, true) };
}
