import express from 'express';
import { createHealthHandler } from '@uniexam/observability';
import type { PrivateApiClient } from '../clients/private-api';
import type { Poller } from '../consumer/poller';

/** Máy chủ HTTP nhỏ chỉ để phục vụ /health và /metrics cho admin và hạ tầng. */
export function createHealthApp(client: PrivateApiClient, poller: Poller, pollMs: number) {
  const app = express();

  app.disable('x-powered-by');
  app.get(
    '/health',
    createHealthHandler('grading-worker', [
      { name: 'private-api', check: () => client.health() },
      {
        name: 'poller',
        check: async () => {
          // Vòng polling phải liên lạc được với private-api trong khoảng vài chu kỳ gần đây.
          const staleAfter = Math.max(pollMs * 10, 30_000);
          if (poller.lastContactAt === null) throw new Error('chưa liên lạc được private-api lần nào');
          if (Date.now() - poller.lastContactAt > staleAfter) throw new Error('lâu không liên lạc được private-api');
        }
      }
    ])
  );
  return app;
}
