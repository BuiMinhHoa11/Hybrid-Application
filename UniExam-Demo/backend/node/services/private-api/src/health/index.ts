import { pingDb } from '@uniexam/db';
import { createHealthHandler } from '@uniexam/observability';

export const healthHandler = createHealthHandler('private-api', [{ name: 'database', check: pingDb }]);
