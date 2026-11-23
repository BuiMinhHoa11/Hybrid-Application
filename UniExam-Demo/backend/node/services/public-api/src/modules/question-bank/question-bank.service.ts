import type { AuthUser } from '@uniexam/auth';
import { notFound } from '@uniexam/observability';
import type { ListQuery, QuestionBody } from './question-bank.dto';
import * as repo from './question-bank.repository';

/** Quản trị viên xem toàn bộ; giáo viên chỉ thấy ngân hàng câu hỏi của mình. */
const scope = (user: AuthUser) => (user.role === 'admin' ? undefined : user.id);

export async function list(user: AuthUser, q: ListQuery) {
  const { items, total } = await repo.list(q, scope(user));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function get(user: AuthUser, id: string) {
  const q = await repo.findById(id, scope(user));
  if (!q) throw notFound('Không tìm thấy câu hỏi');
  return q;
}

export function create(user: AuthUser, body: QuestionBody) {
  return repo.insert(user.id, body);
}

export async function update(user: AuthUser, id: string, body: QuestionBody) {
  const q = await repo.update(id, body, scope(user));
  if (!q) throw notFound('Không tìm thấy câu hỏi');
  return q;
}

export async function remove(user: AuthUser, id: string) {
  // Đề thi đã lưu giữ bản chụp riêng nên xóa câu hỏi khỏi ngân hàng không ảnh hưởng đề.
  if (!(await repo.remove(id, scope(user)))) throw notFound('Không tìm thấy câu hỏi');
  return { deleted: true };
}

export function filters(user: AuthUser) {
  return repo.filterOptions(scope(user));
}
