import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-secret-change-me-please-0123456789';
const DEV_INTERNAL_KEY = 'dev-internal-key-change-me';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1).default('postgres://uniexam:uniexam@localhost:5432/uniexam'),

  JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('8h'),
  INTERNAL_API_KEY: z.string().min(8).default(DEV_INTERNAL_KEY),

  PUBLIC_API_PORT: z.coerce.number().int().positive().default(4000),
  PRIVATE_API_PORT: z.coerce.number().int().positive().default(4001),
  WORKER_PORT: z.coerce.number().int().positive().default(4002),

  PRIVATE_API_URL: z.string().url().default('http://localhost:4001'),
  WORKER_URL: z.string().url().default('http://localhost:4002'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().default('*'),
  /** public-api tự áp migration khi khởi động. Đặt false nếu muốn chạy migration thủ công. */
  AUTO_MIGRATE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  LIFECYCLE_INTERVAL_MS: z.coerce.number().int().min(200).default(5000),
  GRADING_POLL_MS: z.coerce.number().int().min(100).default(2000)
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  internalApiKey: string;
  publicApiPort: number;
  privateApiPort: number;
  workerPort: number;
  privateApiUrl: string;
  workerUrl: string;
  frontendUrl: string;
  corsOrigin: string;
  autoMigrate: boolean;
  lifecycleIntervalMs: number;
  gradingPollMs: number;
}

/**
 * Đọc và kiểm tra biến môi trường. Lỗi cấu hình làm tiến trình dừng ngay khi khởi động
 * thay vì chạy với giá trị sai. Ở production, các khóa bí mật mặc định bị từ chối.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(stripEmpty(env));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  if (isProduction) {
    const problems: string[] = [];
    if (e.JWT_SECRET === DEV_JWT_SECRET || e.JWT_SECRET.length < 32) {
      problems.push('JWT_SECRET phải được đặt, tối thiểu 32 ký tự và khác giá trị mẫu');
    }
    if (e.INTERNAL_API_KEY === DEV_INTERNAL_KEY) {
      problems.push('INTERNAL_API_KEY phải được đặt và khác giá trị mẫu');
    }
    if (problems.length) {
      throw new Error(`Cấu hình production không an toàn:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    }
  }

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    internalApiKey: e.INTERNAL_API_KEY,
    publicApiPort: e.PUBLIC_API_PORT,
    privateApiPort: e.PRIVATE_API_PORT,
    workerPort: e.WORKER_PORT,
    privateApiUrl: e.PRIVATE_API_URL.replace(/\/$/, ''),
    workerUrl: e.WORKER_URL.replace(/\/$/, ''),
    frontendUrl: e.FRONTEND_URL.replace(/\/$/, ''),
    corsOrigin: e.CORS_ORIGIN,
    autoMigrate: e.AUTO_MIGRATE,
    lifecycleIntervalMs: e.LIFECYCLE_INTERVAL_MS,
    gradingPollMs: e.GRADING_POLL_MS
  };
}

function stripEmpty(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

let cached: Config | undefined;

/** Cấu hình dùng chung của tiến trình, đọc một lần. */
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
