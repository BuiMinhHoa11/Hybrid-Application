import type { Difficulty } from '@uniexam/contracts';

export interface PaperRule {
  chapter?: string;
  topic?: string;
  difficulty?: Difficulty;
  count: number;
}

export interface Shortage {
  ruleIndex: number;
  requested: number;
  available: number;
}

interface Candidate {
  id: string;
  chapter: string;
  topic: string;
  difficulty: Difficulty;
}

const specificity = (r: PaperRule) => Number(!!r.chapter) + Number(!!r.topic) + Number(!!r.difficulty);

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Chọn ngẫu nhiên câu hỏi theo điều kiện (UC02B). Mỗi câu chỉ được chọn một lần.
 * Điều kiện cụ thể hơn được xử lý trước để không bị điều kiện chung lấy mất câu,
 * còn thứ tự kết quả vẫn theo thứ tự các điều kiện người dùng nhập.
 */
export function pickQuestions<T extends Candidate>(
  pool: T[],
  rules: PaperRule[],
  rng: () => number = Math.random
): { picked: T[]; shortages: Shortage[] } {
  const used = new Set<string>();
  const perRule: T[][] = rules.map(() => []);
  const shortages: Shortage[] = [];

  const order = rules.map((_, i) => i).sort((a, b) => specificity(rules[b]) - specificity(rules[a]) || a - b);

  for (const i of order) {
    const rule = rules[i];
    const matches = pool.filter(
      (q) =>
        !used.has(q.id) &&
        (!rule.chapter || q.chapter === rule.chapter) &&
        (!rule.topic || q.topic === rule.topic) &&
        (!rule.difficulty || q.difficulty === rule.difficulty)
    );
    const chosen = shuffle(matches, rng).slice(0, rule.count);
    chosen.forEach((q) => used.add(q.id));
    perRule[i] = chosen;
    if (chosen.length < rule.count) shortages.push({ ruleIndex: i, requested: rule.count, available: chosen.length });
  }

  return { picked: perRule.flat(), shortages: shortages.sort((a, b) => a.ruleIndex - b.ruleIndex) };
}
