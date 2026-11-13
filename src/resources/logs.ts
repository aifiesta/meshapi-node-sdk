import type { HttpClient } from "../http";

// ---------------------------------------------------------------------------
// Logs types
// ---------------------------------------------------------------------------

/** Permissions that gate the `/v1/logs` endpoints. */
export type LogsPermission = "logs:read" | "logs:read_bodies";

/** A scalar query value. Arrays are not accepted: each parameter is sent once. */
export type LogsQueryValue = string | number | boolean | undefined | null;

/** Query parameters forwarded to a Loki read path. */
export type LokiQueryParams = Record<string, LogsQueryValue>;

/** Envelope returned by Loki read paths. The `data` shape depends on the path. */
export interface LokiResponse<T = unknown> {
  status: string;
  data: T;
  [key: string]: unknown;
}

/** Parameters for `GET /v1/logs/loki/api/v1/query`. */
export interface LokiInstantQueryParams extends LokiQueryParams {
  /** LogQL expression. */
  query: string;
  time?: string | number;
  limit?: number;
  direction?: "forward" | "backward";
}

/** Parameters for `GET /v1/logs/loki/api/v1/query_range`. */
export interface LokiRangeQueryParams extends LokiQueryParams {
  /** LogQL expression. */
  query: string;
  start?: string | number;
  end?: string | number;
  step?: string | number;
  limit?: number;
  direction?: "forward" | "backward";
}

/** Parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams extends LokiQueryParams {
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  limit?: number;
  start?: string | number;
  end?: string | number;
}

/** One exported request/response body record. */
export interface LogBodyRecord {
  [key: string]: unknown;
}

/** Response from `GET /v1/logs/bodies`. */
export interface LogBodiesResponse {
  /** Cursor for the next page, or null when there are no more records. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withQuery(path: string, params?: LokiQueryParams): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

const LOKI = "/v1/logs/loki/api/v1";

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/**
 * Read-only Loki-compatible access to your org's request logs.
 *
 * Requires the `logs:read` permission.
 */
export class LokiResource {
  constructor(private readonly http: HttpClient) {}

  private read<T>(path: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.http.get<LokiResponse<T>>(withQuery(`${LOKI}${path}`, params));
  }

  /** `GET /v1/logs/loki/api/v1/query` — run an instant LogQL query. */
  query<T = unknown>(params: LokiInstantQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/query", params);
  }

  /** `GET /v1/logs/loki/api/v1/query_range` — run a LogQL query over a time range. */
  queryRange<T = unknown>(params: LokiRangeQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/query_range", params);
  }

  /** `GET /v1/logs/loki/api/v1/labels` — list label names. */
  labels<T = string[]>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/labels", params);
  }

  /** `GET /v1/logs/loki/api/v1/label/{name}/values` — list values for a label. */
  labelValues<T = string[]>(name: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** `GET /v1/logs/loki/api/v1/series` — list streams matching a selector. */
  series<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/series", params);
  }

  /** `GET /v1/logs/loki/api/v1/detected_fields` — list fields detected in log lines. */
  detectedFields<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/detected_fields", params);
  }

  /** `GET /v1/logs/loki/api/v1/detected_field/{name}/values` — list values for a detected field. */
  detectedFieldValues<T = unknown>(name: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** `GET /v1/logs/loki/api/v1/detected_labels` — list detected labels. */
  detectedLabels<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/detected_labels", params);
  }

  /** `GET /v1/logs/loki/api/v1/format_query` — format a LogQL expression. */
  formatQuery<T = string>(params: { query: string } & LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/format_query", params);
  }

  /** `GET /v1/logs/loki/api/v1/index/stats` — index statistics for a selector. */
  indexStats<T = unknown>(params?: LokiQueryParams): Promise<T> {
    return this.http.get<T>(withQuery(`${LOKI}/index/stats`, params));
  }

  /** `GET /v1/logs/loki/api/v1/index/volume` — log volume for a selector. */
  indexVolume<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/index/volume", params);
  }

  /** `GET /v1/logs/loki/api/v1/index/volume_range` — log volume over a time range. */
  indexVolumeRange<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/index/volume_range", params);
  }

  /** `GET /v1/logs/loki/api/v1/patterns` — detected log line patterns. */
  patterns<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.read<T>("/patterns", params);
  }

  /** `GET /v1/logs/loki/api/v1/status/buildinfo` — Loki build information. */
  buildinfo<T = Record<string, unknown>>(): Promise<T> {
    return this.http.get<T>(`${LOKI}/status/buildinfo`);
  }
}

/** Access to your org's request logs and exported bodies. */
export class LogsResource {
  /** Loki-compatible read paths. Requires `logs:read`. */
  readonly loki: LokiResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiResource(http);
  }

  /**
   * `GET /v1/logs/bodies` — read your org's exported request and response bodies.
   *
   * Requires `logs:read_bodies`, which `logs:read` does not imply.
   * Page with the returned `next_cursor`.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesResponse> {
    return this.http.get<LogBodiesResponse>(withQuery("/v1/logs/bodies", params));
  }
}
