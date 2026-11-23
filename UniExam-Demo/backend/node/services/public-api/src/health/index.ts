import { pingDb } from '@uniexam/db';
import { createHealthHandler } from '@uniexam/observability';

/** GET /health: kiểm tra kết nối cơ sở dữ liệu. */
export const healthHandler = createHealthHandler('public-api', [{ name: 'database', check: pingDb }]);
