import { closePool } from '@uniexam/db';
import { createAdmin } from '@uniexam/db/seeds';

/**
 * Tạo tài khoản quản trị đầu tiên.
 *   npm run create-admin -- <username> <mật khẩu> ["Họ tên"]
 * hoặc đặt ADMIN_USERNAME / ADMIN_PASSWORD trong môi trường.
 */
const [argUser, argPass, argName] = process.argv.slice(2);
const username = argUser ?? process.env.ADMIN_USERNAME;
const password = argPass ?? process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('Cách dùng: npm run create-admin -- <username> <mật khẩu> ["Họ tên"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Mật khẩu cần tối thiểu 8 ký tự.');
  process.exit(1);
}

try {
  const { created } = await createAdmin(username, password, argName);
  console.log(created ? `Đã tạo quản trị viên "${username}".` : `Tài khoản "${username}" đã tồn tại, không thay đổi.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closePool();
}
