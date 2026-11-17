import { getConfig } from '@uniexam/config';
import { closePool, migrate } from '@uniexam/db';
import { errorMeta } from '@uniexam/observability';
import { createApp } from './app';
import { logger } from './logger';

const cfg = getConfig();

async function main() {
  // public-api là dịch vụ đầu tiên khởi động nên chịu trách nhiệm áp migration.
  // migrate() dùng khóa advisory nên chạy song song nhiều bản vẫn an toàn.
  if (cfg.autoMigrate) {
    const { applied } = await migrate();
    if (applied.length) logger.info('Đã áp migration', { applied });
  }

  const server = createApp().listen(cfg.publicApiPort, () => {
    logger.info('public-api đã khởi động', { port: cfg.publicApiPort, env: cfg.nodeEnv });
  });

  const shutdown = (signal: string) => {
    logger.info('Đang tắt public-api', { signal });
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('public-api không khởi động được', errorMeta(err));
  process.exit(1);
});
