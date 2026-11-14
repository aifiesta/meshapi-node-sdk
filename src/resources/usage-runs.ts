import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Run trace types (GET /v1/usage/runs/{run_id}, X-Mesh-Run-Id)
// ---------------------------------------------------------------------------

/** Request header that tags every request in an agent run with one caller-supplied id. */
export const RUN_ID_HEADER = 'X-Mesh-Run-Id';

/** Optional `run_id` added to usage and rejection filters. */
export interface RunIdFilter {
  /** Narrow `POST /v1/usage/events` or `POST /v1/usage/rejections` to one run. */
  run_id?: string | null;
}

/** One usage row in a run trace. `run_id` is also present on usage event rows. */
export interface RunTraceHop {
  run_id?: string | null;
  request_id?: string | null;
  [key: string]: unknown;
}

/** Response from `GET /v1/usage/runs/{run_id}`. */
export interface RunTrace {
  run_id?: string;
  /** Usage rows for the run, oldest first. The list is capped. */
  hops?: RunTraceHop[];
  /** Total charged across every row of the run, including rows past the cap. */
  total_charged_usd?: number | null;
  /** Number of serving rows (not requests) in the run. */
  served_rows?: number;
  /** True when `hops` was cut at the cap. */
  truncated?: boolean;
  [key: string]: unknown;
}

/**
 * Returns true when a run id can be read back through `GET /v1/usage/runs/{run_id}`.
 * Ids containing `/`, and the ids `.` and `..`, are dropped by the gateway.
 */
export function isReadableRunId(runId: string): boolean {
  if (!runId) return false;
  if (runId.includes('/')) return false;
  if (runId === '.' || runId === '..') return false;
  return true;
}

/** Run-level usage reads. */
export class UsageRunsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get one run as an ordered trace with a single spend figure (`GET /v1/usage/runs/{run_id}`).
   * Throws before sending when the id cannot be addressed by the route.
   */
  retrieve(runId: string): Promise<RunTrace> {
    if (!isReadableRunId(runId)) {
      throw new Error(`run id ${JSON.stringify(runId)} cannot be read: it must be non-empty, contain no '/', and not be '.' or '..'`);
    }
    return this.http.request<RunTrace>({
      method: 'GET',
      path: `/v1/usage/runs/${encodeURIComponent(runId)}`,
    });
  }
}
