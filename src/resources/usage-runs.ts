import type { Transport } from './_transport.js';

// ---------------------------------------------------------------------------
// Usage runs
// ---------------------------------------------------------------------------

/** `run_id` filter now accepted by `UsageFilter` and `RejectionFilter`. */
export interface RunIdFilter {
  run_id?: string;
}

/** One usage row in a run trace. `UsageEventOut` now carries `run_id`. */
export interface UsageRunHop {
  request_id?: string;
  run_id?: string | null;
  model?: string;
  charge_usd?: number | null;
  [key: string]: unknown;
}

/** Response of `GET /v1/usage/runs/{run_id}`. */
export interface UsageRunTrace {
  run_id: string;
  /** Usage rows in order. The list is capped; see `truncated`. */
  hops: UsageRunHop[];
  /** Total charged for the whole run, including rows beyond the cap. */
  total_charged_usd: number | null;
  /** Number of usage rows in the run (rows, not requests). */
  served_rows: number;
  /** `true` when `hops` was cut at the cap. */
  truncated: boolean;
  [key: string]: unknown;
}

/**
 * Returns the reason a run id cannot be read through `GET /v1/usage/runs/{run_id}`,
 * or `null` when it can. Ids containing `/`, and the ids `.` and `..`, cannot
 * be addressed as a single path segment.
 */
export function runIdUnreadable(runId: string): string | null {
  if (runId.length === 0) return 'empty';
  if (runId.includes('/')) return 'contains_slash';
  if (runId === '.' || runId === '..') return 'dot_segment';
  return null;
}

export class UsageRunsResource {
  constructor(private readonly http: Transport) {}

  /**
   * Fetch a run as one ordered trace with one spend figure via
   * `GET /v1/usage/runs/{run_id}`.
   *
   * Requests refused before a model are not in the trace; read them with the
   * usage rejections endpoint filtered by `run_id`.
   */
  retrieve(runId: string): Promise<UsageRunTrace> {
    const reason = runIdUnreadable(runId);
    if (reason) {
      throw new Error(`run id cannot be read by GET /v1/usage/runs/{run_id}: ${reason}`);
    }
    return this.http.request<UsageRunTrace>(
      'GET',
      `/v1/usage/runs/${encodeURIComponent(runId)}`,
    );
  }
}
