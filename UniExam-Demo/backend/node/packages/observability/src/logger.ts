export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Logger JSON một dòng mỗi bản ghi, dễ thu thập bằng stack log bất kỳ. */
export function createLogger(
  service: string,
  level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info',
  bindings: Record<string, unknown> = {}
): Logger {
  const threshold = ORDER[level] ?? ORDER.info;

  const write = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (ORDER[lvl] < threshold) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: lvl,
      service,
      msg,
      ...bindings,
      ...meta
    });
    (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };

  return {
    debug: (m, x) => write('debug', m, x),
    info: (m, x) => write('info', m, x),
    warn: (m, x) => write('warn', m, x),
    error: (m, x) => write('error', m, x),
    child: (extra) => createLogger(service, level, { ...bindings, ...extra })
  };
}

export function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return { error: String(err) };
}
