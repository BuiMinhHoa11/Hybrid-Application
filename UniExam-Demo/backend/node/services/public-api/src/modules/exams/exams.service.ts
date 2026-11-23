import type { AuthUser } from '@uniexam/auth';
import type { ExamRow } from '@uniexam/db';
import { conflict, forbidden, notFound, unprocessable } from '@uniexam/observability';
import type { AudienceBody, CreateExamBody, ListExamsQuery, UpdateExamBody } from './exams.dto';
import * as repo from './exams.repository';
import { validateExam } from './exams.validation';

const scope = (user: AuthUser) => (user.role === 'admin' ? undefined : user.id);

async function loadOwned(user: AuthUser, id: string): Promise<ExamRow> {
  const exam = await repo.findById(id);
  if (!exam) throw notFound('Không tìm thấy kỳ thi');
  if (user.role !== 'admin' && exam.ownerId !== user.id) throw forbidden('Bạn không có quyền với kỳ thi này');
  return exam;
}

/** Chỉ kỳ thi ở trạng thái nháp mới được sửa nội dung và đối tượng dự thi. */
function assertDraft(exam: ExamRow) {
  if (exam.status !== 'draft') {
    throw conflict('Kỳ thi đã phát hành nên không thể sửa. Chỉ kỳ thi nháp mới được cập nhật.', 'EXAM_NOT_DRAFT');
  }
}

async function assertPaperUsable(user: AuthUser, paperId: string | null | undefined) {
  if (paperId && !(await repo.paperBelongsTo(paperId, scope(user)))) {
    throw unprocessable('Đề thi không tồn tại hoặc không thuộc về bạn', [{ field: 'paperId', message: 'Đề thi không hợp lệ' }]);
  }
}

export async function list(user: AuthUser, q: ListExamsQuery) {
  const { items, total } = await repo.list(q, scope(user));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function get(user: AuthUser, id: string) {
  const exam = await loadOwned(user, id);
  return { exam, audience: await repo.listAudience(id) };
}

export async function create(user: AuthUser, body: CreateExamBody) {
  await assertPaperUsable(user, body.paperId);
  return repo.insert(user.id, body);
}

export async function update(user: AuthUser, id: string, patch: UpdateExamBody) {
  const exam = await loadOwned(user, id);
  assertDraft(exam);
  await assertPaperUsable(user, patch.paperId);

  const start = patch.startTime ?? exam.startTime;
  const end = patch.endTime ?? exam.endTime;
  if (end <= start) throw unprocessable('Thời gian kết thúc phải sau thời gian bắt đầu', [{ field: 'endTime', message: 'Phải sau thời gian bắt đầu' }]);
  const publishAt = patch.publishAt === undefined ? exam.publishAt : patch.publishAt;
  if (publishAt && publishAt > start) {
    throw unprocessable('Giờ công bố phải trước hoặc bằng giờ bắt đầu làm bài', [{ field: 'publishAt', message: 'Phải trước hoặc bằng giờ bắt đầu làm bài' }]);
  }

  const updated = await repo.update(id, patch, 'draft');
  if (!updated) throw conflict('Trạng thái kỳ thi vừa thay đổi, hãy tải lại trang', 'STATE_CHANGED');
  return updated;
}

export async function remove(user: AuthUser, id: string) {
  const exam = await loadOwned(user, id);
  assertDraft(exam);
  if (!(await repo.remove(id))) throw conflict('Trạng thái kỳ thi vừa thay đổi, hãy tải lại trang', 'STATE_CHANGED');
  return { deleted: true };
}

async function checkExam(exam: ExamRow) {
  const paper = exam.paperId ? await repo.paperStats(exam.paperId) : null;
  const audienceCount = await repo.countAudience(exam.id);
  return validateExam({ exam, paper, audienceCount, now: new Date() });
}

/** Nút "Kiểm tra" của UC02C: đề, đáp án, thời gian và đối tượng dự thi. */
export async function validate(user: AuthUser, id: string) {
  const exam = await loadOwned(user, id);
  assertDraft(exam);
  const issues = await checkExam(exam);
  return { valid: issues.length === 0, issues };
}

/** Nút "Phát hành": kiểm tra lại rồi chuyển sang "đã phát hành". */
export async function publish(user: AuthUser, id: string) {
  const exam = await loadOwned(user, id);
  assertDraft(exam);
  const issues = await checkExam(exam);
  if (issues.length) throw unprocessable('Kỳ thi chưa đủ điều kiện phát hành', issues);
  const published = await repo.markPublished(id);
  if (!published) throw conflict('Trạng thái kỳ thi vừa thay đổi, hãy tải lại trang', 'STATE_CHANGED');
  return published;
}

/** Thay toàn bộ đối tượng dự thi bằng danh sách mới (nhận mã sinh viên hoặc id). */
export async function setAudience(user: AuthUser, id: string, body: AudienceBody) {
  const exam = await loadOwned(user, id);
  assertDraft(exam);

  const students = await repo.resolveStudents(body.studentIds, body.usernames);
  const foundIds = new Set(students.map((s) => s.id));
  const foundNames = new Set(students.map((s) => s.username.toLowerCase()));
  const unknown = [
    ...body.studentIds.filter((x) => !foundIds.has(x)),
    ...body.usernames.filter((x) => !foundNames.has(x.toLowerCase()))
  ];
  if (unknown.length) {
    throw unprocessable(`Có ${unknown.length} sinh viên không tồn tại hoặc không hoạt động`, { unknown });
  }

  await repo.replaceAudience(id, [...new Set(students.map((s) => s.id))]);
  return { audience: await repo.listAudience(id) };
}
