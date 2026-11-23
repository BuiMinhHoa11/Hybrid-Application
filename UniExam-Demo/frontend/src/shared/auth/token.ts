export const AUTH_STORAGE_KEY = 'uniexam.token';
const KEY = AUTH_STORAGE_KEY;

/** localStorage có thể bị chặn (chế độ riêng tư) nên luôn có bản dự phòng trong bộ nhớ. */
let memory: string | null = null;

export const tokenStore = {
  sync(token: string | null): void {
    memory = token;
  },
  get(): string | null {
    try {
      return localStorage.getItem(KEY) ?? memory;
    } catch {
      return memory;
    }
  },
  set(token: string): void {
    memory = token;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* chỉ dùng bộ nhớ */
    }
  },
  clear(): void {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  }
};
