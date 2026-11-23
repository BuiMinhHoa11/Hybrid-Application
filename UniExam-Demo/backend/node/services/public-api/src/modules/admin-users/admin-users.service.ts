import type { AuthUser } from '@uniexam/auth';
import { hashPassword } from '@uniexam/auth';
import { conflict, notFound } from '@uniexam/observability';
import type { CreateUserBody, ListUsersQuery, UpdateUserBody } from './admin-users.dto';
import * as repo from './admin-users.repository';

export async function list(q: ListUsersQuery) {
  const { items, total } = await repo.list(q);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function get(id: string) {
  const user = await repo.findDetail(id);
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}

export async function create(body: CreateUserBody) {
  return repo.insert({
    username: body.username,
    fullName: body.fullName,
    email: body.email ?? null,
    role: body.role,
    passwordHash: await hashPassword(body.password)
  });
}

export async function update(actor: AuthUser, id: string, body: UpdateUserBody) {
  if (id === actor.id && body.role !== undefined && body.role !== actor.role) {
    // Tránh trường hợp quản trị viên duy nhất tự hạ quyền và khóa mình khỏi hệ thống.
    throw conflict('Không thể tự đổi vai trò của chính mình', 'SELF_ROLE_CHANGE');
  }
  const user = await repo.update(id, {
    fullName: body.fullName,
    email: body.email,
    role: body.role,
    passwordHash: body.password ? await hashPassword(body.password) : undefined
  });
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}

export async function setActive(actor: AuthUser, id: string, active: boolean) {
  if (id === actor.id && !active) throw conflict('Không thể tự khóa tài khoản của chính mình', 'SELF_LOCK');
  const user = await repo.setActive(id, active);
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}
