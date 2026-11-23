import type { Difficulty, ExamStatus, ResultDisplayStatus, Role, SubmissionStatus } from '@uniexam/contracts';

const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

export function formatTime(iso: string | Date): string {
  return timeFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** 3725000 ms -> "1:02:05"; dưới 1 giờ -> "02:05". Không bao giờ âm. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO -> giá trị cho <input type="datetime-local"> theo giờ địa phương. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Giá trị <input type="datetime-local"> (giờ địa phương) -> ISO UTC. Rỗng/không hợp lệ -> ''. */
export function fromLocalInput(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export const roleLabel: Record<Role, string> = { student: 'Sinh viên', teacher: 'Giáo viên', admin: 'Quản trị viên' };

export const difficultyLabel: Record<Difficulty, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };

export const examStatusLabel: Record<ExamStatus, string> = {
  draft: 'Nháp',
  published: 'Đã phát hành',
  open: 'Đang mở',
  locked: 'Đã khóa bài',
  closed: 'Đã đóng'
};

export const resultStatusLabel: Record<ResultDisplayStatus, string> = {
  in_progress: 'Đang làm bài',
  pending_grading: 'Chờ chấm',
  graded: 'Đã chấm',
  published: 'Đã công bố'
};

export const submissionStatusLabel: Record<SubmissionStatus, string> = {
  pending_grading: 'Chờ chấm',
  grading: 'Đang chấm',
  graded: 'Đã chấm',
  failed: 'Chấm lỗi'
};

export const optionLetter = (index: number) => String.fromCharCode(65 + index);

/** Số điểm hiển thị gọn: 8.5, 10 (không thừa số 0). */
export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}
