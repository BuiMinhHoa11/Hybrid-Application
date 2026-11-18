import type { Role } from '@uniexam/contracts';
import { publicApi } from '../../shared/api';
import type { Page, SessionUser, SystemStatus, User, UserDetail } from './types';

export const authApi = {
  login: (username: string, password: string) =>
    publicApi.post<{ token: string; user: SessionUser }>('/auth/login', { username, password }),
  me: () => publicApi.get<User>('/auth/me')
};

export interface UserListParams {
  q?: string;
  role?: Role | '';
  active?: 'true' | 'false' | '';
  page?: number;
  pageSize?: number;
}

export interface UserInput {
  username?: string;
  fullName?: string;
  email?: string | null;
  role?: Role;
  password?: string;
}

export const adminUserApi = {
  list: (params: UserListParams) => publicApi.get<Page<User>>('/admin/users', { ...params }),
  get: (id: string) => publicApi.get<UserDetail>(`/admin/users/${id}`),
  create: (input: UserInput) => publicApi.post<User>('/admin/users', input),
  update: (id: string, input: UserInput) => publicApi.put<User>(`/admin/users/${id}`, input),
  lock: (id: string) => publicApi.post<User>(`/admin/users/${id}/lock`),
  unlock: (id: string) => publicApi.post<User>(`/admin/users/${id}/unlock`),
  systemStatus: () => publicApi.get<SystemStatus>('/admin/system-status')
};
