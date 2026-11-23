import type { Role } from '@uniexam/contracts';

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

export interface User extends SessionUser {
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends User {
  stats: { questions: number; exams: number; sessions: number };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ServiceStatus {
  name: string;
  status: 'up' | 'down';
  latencyMs: number;
  detail?: string;
}

export interface SystemStatus {
  overall: 'ok' | 'degraded';
  checkedAt: string;
  services: ServiceStatus[];
}
