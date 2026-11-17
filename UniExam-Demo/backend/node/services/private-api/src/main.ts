import { getConfig } from '@uniexam/config';
import { closePool } from '@uniexam/db';
import { createApp } from './app';
import { startLifecycleJob } from './jobs/exam-lifecycle';
import { logger } from './logger';

const cfg = getConfig();
const app = createApp();
const server = app.listen(cfg.privateApiPort, () => {
  logger.info('private-api đã khởi động', { port: cfg.privateApiPort, env: cfg.nodeEnv });
});
const stopJob = startLifecycleJob(cfg.lifecycleIntervalMs);

async function shutdown(signal: string) {
  logger.info('Đang tắt private-api', { signal });
  stopJob();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
