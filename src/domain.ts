export interface JobRequest { type: 'report'; payload: { values: number[] }; maxAttempts: number }
export interface ClaimedJob { id: string; request: JobRequest; attempts: number; max_attempts: number; claim_token: string; correlation_id: string }
export class ConflictError extends Error {}
export function backoff(attempt: number): number { return Math.min(60_000, 1000 * 2 ** Math.min(attempt - 1, 6)); }
export async function processReport(request: JobRequest): Promise<unknown> {
  const values = request.payload.values;
  const sum = values.reduce((a,b) => a+b,0);
  if (!Number.isFinite(sum)) throw new Error('Report total exceeds numeric range');
  return { count: values.length, sum, average: values.length ? sum / values.length : null };
}
export interface Store {
  submit(key: string, request: JobRequest, correlationId: string): Promise<{job: Record<string, unknown>; created: boolean}>;
  get(id: string): Promise<Record<string, unknown> | undefined>;
  history(id: string): Promise<Record<string, unknown>[]>;
  ready(): Promise<void>;
}
export interface WorkStore {
  claim(leaseMs: number): Promise<ClaimedJob | undefined>;
  finish(job: ClaimedJob, result: unknown, error?: string): Promise<boolean>;
}
