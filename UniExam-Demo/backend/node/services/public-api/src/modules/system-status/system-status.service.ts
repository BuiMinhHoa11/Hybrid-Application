import { getConfig } from '@uniexam/config';
import { pingDb } from '@uniexam/db';

export interface ServiceStatus {
  name: string;
  status: 'up' | 'down';
  latencyMs: number;
  detail?: string;
}

const TIMEOUT_MS = 3000;

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

async function timed(name: string, fn: () => Promise<void>): Promise<ServiceStatus> {
  const started = Date.now();
  try {
    await fn();
    return { name, status: 'up', latencyMs: Date.now() - started };
  } catch (err) {
    return {
      name,
      status: 'down',
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err)
    };
  }
}

export function checkHttp(name: string, url: string, fetcher: Fetcher = fetch): Promise<ServiceStatus> {
  return timed(name, async () => {
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

/**
 * UC03A: gọi health check của frontend, public-api (chính nó, qua kiểm tra DB),
 * private-api và grading-worker, kèm cơ sở dữ liệu.
 */
export async function getSystemStatus(fetcher: Fetcher = fetch) {
  const cfg = getConfig();
  const services = await Promise.all([
    checkHttp('frontend', `${cfg.frontendUrl}/health`, fetcher),
    timed('public-api', pingDb),
    checkHttp('private-api', `${cfg.privateApiUrl}/health`, fetcher),
    checkHttp('grading-worker', `${cfg.workerUrl}/health`, fetcher),
    timed('database', pingDb)
  ]);
  return {
    overall: services.every((s) => s.status === 'up') ? 'ok' : 'degraded',
    checkedAt: new Date(),
    services
  };
}
