import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Docker Desktop may be installed before this terminal's PATH is refreshed.
const desktopDocker = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe')
  : undefined;
const docker = desktopDocker && existsSync(desktopDocker) ? desktopDocker : 'docker';
const commands = {
  start: ['up', '--build', '-d', '--wait'],
  stop: ['stop'],
  logs: ['logs', '-f', '--tail=100'],
  status: ['ps'],
  migrate: ['exec', 'private-api', 'python', '-m', 'uniexam.cli', 'init-db'],
  seed: ['exec', 'private-api', 'python', '-m', 'uniexam.cli', 'seed-demo'],
  'create-admin': ['exec', 'private-api', 'python', '-m', 'uniexam.cli', 'create-admin'],
  'change-password': ['exec', 'private-api', 'python', '-m', 'uniexam.cli', 'change-password']
};
const command = process.argv[2] ?? 'start';
if (!Object.hasOwn(commands, command)) {
  console.error(`Lệnh không hợp lệ. Chọn: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
const result = spawnSync(docker, ['compose', '--env-file', '.env', '-f', 'backend/compose.local.yaml', ...commands[command], ...process.argv.slice(3)], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  stdio: 'inherit',
  shell: false
});
if (result.error) console.error('Không chạy được Docker. Hãy cài và mở Docker Desktop, sau đó chạy lại.');
if (result.status === 0 && command === 'start') console.log('UniExam: http://localhost:8081 (hoặc FRONTEND_PORT bạn đã cấu hình).');
process.exit(result.status ?? 1);
