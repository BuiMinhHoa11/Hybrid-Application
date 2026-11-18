import { closePool } from '@uniexam/db';
import { DEMO_CREDENTIALS, seedDemo } from '@uniexam/db/seeds';

try {
  const { created } = await seedDemo();
  console.log(created ? 'Đã nạp dữ liệu mẫu.' : 'Dữ liệu mẫu đã có, không thay đổi gì.');
  const { admin, teacher, students } = DEMO_CREDENTIALS;
  console.log('\nTài khoản demo:');
  console.log(`  quản trị : ${admin.username} / ${admin.password}`);
  console.log(`  giáo viên: ${teacher.username} / ${teacher.password}`);
  console.log(`  sinh viên: ${students[0].username}..${students[students.length - 1].username} / ${students[0].password}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closePool();
}
