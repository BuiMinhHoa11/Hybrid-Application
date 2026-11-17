import type { GradedSubmission } from '../scoring/barem';

export interface ClaimedSubmission {
  submissionId: string;
  examId: string;
  studentId: string;
  attempt: number;
  answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
  questions: Array<{ id: string; type: string; points: number; correctOptionIds: string[] }>;
}

type FetchFn = typeof fetch;

/** Client gọi grading-gateway của private-api bằng khóa nội bộ. Worker không truy cập DB trực tiếp. */
export class PrivateApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalKey: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  private async call(path: string, body?: unknown): Promise<Response> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': this.internalKey },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`private-api ${path} trả ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res;
  }

  /** Lấy bài chờ chấm kế tiếp; null khi hàng đợi trống. */
  async claim(): Promise<ClaimedSubmission | null> {
    const res = await this.call('/grading/claim');
    if (res.status === 204) return null;
    return (await res.json()) as ClaimedSubmission;
  }

  async submitResult(submissionId: string, workerId: string, graded: GradedSubmission): Promise<void> {
    await this.call(`/grading/${submissionId}/result`, { workerId, ...graded });
  }

  async reportFailure(submissionId: string, reason: string): Promise<void> {
    await this.call(`/grading/${submissionId}/fail`, { reason });
  }

  async health(): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`private-api /health trả ${res.status}`);
  }
}
