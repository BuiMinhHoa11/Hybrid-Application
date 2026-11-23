import { closePool, migrate } from '@uniexam/db';

try {
  const { applied, skipped } = await migrate((m) => console.log(m));
  console.log(`Migration xong: ${applied.length} mới, ${skipped.length} đã có từ trước.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closePool();
}
