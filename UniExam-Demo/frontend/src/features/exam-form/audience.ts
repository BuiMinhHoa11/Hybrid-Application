/** Tách danh sách mã sinh viên người dùng dán vào (xuống dòng, dấu phẩy, chấm phẩy hoặc khoảng trắng), bỏ trùng. */
export function parseUsernames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
