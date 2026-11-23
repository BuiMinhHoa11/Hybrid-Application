import { authorize, requireInternalKey } from '@uniexam/auth';
import { getConfig } from '@uniexam/config';

export const requireStudent = authorize('student');
/** Chỉ grading-worker (giữ INTERNAL_API_KEY) được gọi grading-gateway. */
export const requireInternal = requireInternalKey(getConfig().internalApiKey);
