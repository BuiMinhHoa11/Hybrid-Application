import { authorize } from '@uniexam/auth';

export const requireStudent = authorize('student');
export const requireTeacher = authorize('teacher', 'admin');
export const requireAdmin = authorize('admin');
