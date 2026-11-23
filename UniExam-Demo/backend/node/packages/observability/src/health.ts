import type { RequestHandler } from 'express';

export interface HealthCheck {
  name: string;
  check: () => Promise<unknown>;
}

const CHECK_TIMEOUT_MS = 2500;

async function runCheck(check: HealthCheck): Promise<{ name: string; ok: boolean; error?: string }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check.check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      })
    ]);
    return { name: check.name, ok: true };
  } catch (err) {
    return { name: check.name, ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Handler cho GET /health. 200 khi mọi phụ thuộc hoạt động, 503 khi có phụ thuộc lỗi.
 * Không có phụ thuộc nào thì chỉ báo tiến trình còn sống.
 */
export function createHealthHandler(service: string, checks: HealthCheck[] = []): RequestHandler {
  const startedAt = Date.now();
  return async (_req, res) => {
    const results = await Promise.all(checks.map(runCheck));
    const healthy = results.every((r) => r.ok);
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks: Object.fromEntries(
        results.map((r) => [r.name, r.ok ? 'ok' : { status: 'down', error: r.error }])
      )
    });
  };
}
