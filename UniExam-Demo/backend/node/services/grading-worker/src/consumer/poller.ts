import { errorMeta, type Logger } from '@uniexam/observability';
import type { PrivateApiClient } from '../clients/private-api';
import type { GraderRegistry } from '../graders';
import { gradeSubmission } from '../scoring/barem';

export interface PollerOptions {
  client: PrivateApiClient;
  registry: GraderRegistry;
  logger: Logger;
  workerId: string;
  pollMs: number;
}

const MAX_BACKOFF_MS = 30_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Nhận bài "chờ chấm" bằng polling (UC04A). Còn bài thì chấm liên tiếp không nghỉ,
 * hết bài mới nghỉ pollMs. Lỗi mạng thì lùi dần (backoff) để không dồn dập gọi.
 */
export class Poller {
  private running = false;
  private loop: Promise<void> | null = null;
  /** Lần gần nhất gọi private-api thành công, dùng cho health check. */
  lastContactAt: number | null = null;
  graded = 0;
  failed = 0;

  constructor(private readonly o: PollerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  /** Chấm tối đa một bài. Trả về true nếu có bài được xử lý. */
  async processOne(): Promise<boolean> {
    const claimed = await this.o.client.claim();
    this.lastContactAt = Date.now();
    if (!claimed) return false;

    const log = this.o.logger.child({ submissionId: claimed.submissionId, attempt: claimed.attempt });
    try {
      const graded = gradeSubmission(claimed, this.o.registry);
      await this.o.client.submitResult(claimed.submissionId, this.o.workerId, graded);
      this.graded += 1;
      log.info('Đã chấm bài', { score: graded.score, maxScore: graded.maxScore });
    } catch (err) {
      this.failed += 1;
      log.error('Chấm bài thất bại', errorMeta(err));
      // Báo lỗi để bài quay lại hàng đợi. Nếu cả việc báo lỗi cũng hỏng (mất mạng),
      // bài sẽ tự được giao lại sau khi quá thời hạn "đang chấm" ở private-api.
      await this.o.client
        .reportFailure(claimed.submissionId, err instanceof Error ? err.message : String(err))
        .catch((e) => log.error('Không báo lỗi được cho private-api', errorMeta(e)));
    }
    return true;
  }

  private async run(): Promise<void> {
    let backoff = this.o.pollMs;
    while (this.running) {
      try {
        const worked = await this.processOne();
        backoff = this.o.pollMs;
        if (!worked) await sleep(this.o.pollMs);
      } catch (err) {
        this.o.logger.warn('Không lấy được bài từ private-api, sẽ thử lại', { retryInMs: backoff, ...errorMeta(err) });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }
}
