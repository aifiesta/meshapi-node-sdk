import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Usage runs (/v1/usage/runs)
// ---------------------------------------------------------------------------

/** One request (hop) inside a run. */
export interface RunHop {
  request_id?: string;
  model?: string | null;
  charge_usd?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

/** A run returned as one ordered trace. */
export interface RunTrace {
  run_id: string;
  /** Hops in the order they were served. The list is capped. */
  hops: RunHop[];
  /** Total charged for the whole run, including hops beyond the cap. */
  total_charged_usd?: number | null;
  /** Number of usage rows the run wrote. */
  served_rows?: number;
  /** True when the hop list was cut at the cap. */
  truncated?: boolean;
  [key: string]: unknown;
}

/** `run_id` filter now accepted by usage and rejection filters. */
export interface RunIdFilter {
  run_id?: string | null;
}

/** Read usage grouped by run id. */
export class UsageRunsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/usage/runs/{run_id}` — fetch every request in a run as one
   * ordered trace with one spend figure.
   *
   * Rejects with a 404 `MeshAPIApiError` when no such run exists.
   */
  retrieve(runId: string): Promise<RunTrace> {
    return this.http.request<RunTrace>('GET', `/v1/usage/runs/${encodeURIComponent(runId)}`);
  }
}
