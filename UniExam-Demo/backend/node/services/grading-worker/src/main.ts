import { hostname } from 'node:os';
import { getConfig } from '@uniexam/config';
import { createLogger } from '@uniexam/observability';
import { PrivateApiClient } from './clients/private-api';
import { Poller } from './consumer/poller';
import { GraderRegistry } from './graders';
import { createHealthApp } from './health';

const cfg = getConfig();
const logger = createLogger('grading-worker', cfg.logLevel);
const workerId = `${hostname()}-${process.pid}`;

const client = new PrivateApiClient(cfg.privateApiUrl, cfg.internalApiKey);
const poller = new Poller({ client, registry: new GraderRegistry(), logger, workerId, pollMs: cfg.gradingPollMs });
const server = createHealthApp(client, poller, cfg.gradingPollMs).listen(cfg.workerPort, () => {
  logger.info('grading-worker đã khởi động', { port: cfg.workerPort, workerId, privateApi: cfg.privateApiUrl });
});

poller.start();

async function shutdown(signal: string) {
  logger.info('Đang tắt grading-worker', { signal });
  await poller.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
