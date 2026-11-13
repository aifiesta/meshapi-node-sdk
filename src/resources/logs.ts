/**
 * Logs resource: read your organisation's request logs.
 *
 * Covers:
 * - `GET /v1/logs/bodies`: exported request and response bodies, paged by `next_cursor`.
 * - `GET /v1/logs/loki/api/v1/*`: the Loki-compatible read API, usable as a Grafana Loki data source.
 *
 * Permissions:
 * - The Loki read paths need `logs:read`.
 * - `GET /v1/logs/bodies` needs `logs:read_bodies`. `logs:read` does not include it.
 */

// ---------------------------------------------------------------------------
// Logs types
// ---------------------------------------------------------------------------

/** Organisation permissions that gate the logs endpoints. */
export type LogsPermission = 'logs:read' | 'logs:read_bodies';

/** A query parameter value accepted by the logs endpoints. */
export type LogsQueryValue = string | number | boolean | undefined;

/** Query parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  /** Opaque cursor taken from a previous page's `next_cursor`. */
  cursor?: string;
  [key: string]: LogsQueryValue;
}

/** One page of exported bodies from `GET /v1/logs/bodies`. */
export interface LogBodiesPage {
  /** Cursor for the next page, or `null`/absent when there are no more pages. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

/** Common query parameters for the Loki-compatible read paths. */
export interface LokiQueryParams {
  /** LogQL query. */
  query?: string;
  /** Evaluation time for instant queries. */
  time?: string | number;
  /** Start of the time range. */
  start?: string | number;
  /** End of the time range. */
  end?: string | number;
  /** Maximum number of entries to return. */
  limit?: number;
  /** Query resolution step for range queries. */
  step?: string | number;
  /** Sort order: `forward` or `backward`. */
  direction?: 'forward' | 'backward';
  [key: string]: LogsQueryValue;
}

/** Response envelope returned by the Loki-compatible read paths. */
export interface LokiResponse<T = unknown> {
  status?: string;
  data?: T;
  [key: string]: unknown;
}

/** Minimal transport the logs resource needs: a GET returning parsed JSON. */
export interface LogsTransport {
  get<T>(path: string, query?: Record<string, string | number | boolean>): Promise<T>;
}

function cleanQuery(
  params?: Record<string, LogsQueryValue>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const LOKI_BASE = '/v1/logs/loki/api/v1';

/** Loki-compatible read API under `/v1/logs/loki/api/v1`. Requires `logs:read`. */
export class LokiLogsResource {
  constructor(private readonly http: LogsTransport) {}

  private get<T>(path: string, params?: Record<string, LogsQueryValue>): Promise<LokiResponse<T>> {
    return this.http.get<LokiResponse<T>>(`${LOKI_BASE}${path}`, cleanQuery(params));
  }

  /** Runs an instant LogQL query. `GET /v1/logs/loki/api/v1/query` */
  query<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/query', params);
  }

  /** Runs a LogQL query over a time range. `GET /v1/logs/loki/api/v1/query_range` */
  queryRange<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/query_range', params);
  }

  /** Lists label names. `GET /v1/logs/loki/api/v1/labels` */
  labels(params?: LokiQueryParams): Promise<LokiResponse<string[]>> {
    return this.get<string[]>('/labels', params);
  }

  /** Lists values for one label. `GET /v1/logs/loki/api/v1/label/{name}/values` */
  labelValues(name: string, params?: LokiQueryParams): Promise<LokiResponse<string[]>> {
    return this.get<string[]>(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** Lists log streams matching a selector. `GET /v1/logs/loki/api/v1/series` */
  series<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/series', params);
  }

  /** Lists fields detected in matching logs. `GET /v1/logs/loki/api/v1/detected_fields` */
  detectedFields<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/detected_fields', params);
  }

  /** Lists values for one detected field. `GET /v1/logs/loki/api/v1/detected_field/{name}/values` */
  detectedFieldValues<T = unknown>(name: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** Lists labels detected in matching logs. `GET /v1/logs/loki/api/v1/detected_labels` */
  detectedLabels<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/detected_labels', params);
  }

  /** Formats a LogQL query. `GET /v1/logs/loki/api/v1/format_query` */
  formatQuery<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/format_query', params);
  }

  /** Returns index statistics for a selector. `GET /v1/logs/loki/api/v1/index/stats` */
  indexStats<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/stats', params);
  }

  /** Returns log volume for a selector. `GET /v1/logs/loki/api/v1/index/volume` */
  indexVolume<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/volume', params);
  }

  /** Returns log volume over a time range. `GET /v1/logs/loki/api/v1/index/volume_range` */
  indexVolumeRange<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/volume_range', params);
  }

  /** Returns detected log patterns. `GET /v1/logs/loki/api/v1/patterns` */
  patterns<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/patterns', params);
  }

  /** Returns build information for the Loki-compatible API. `GET /v1/logs/loki/api/v1/status/buildinfo` */
  buildInfo<T = Record<string, unknown>>(): Promise<T> {
    return this.http.get<T>(`${LOKI_BASE}/status/buildinfo`);
  }
}

/** Logs endpoints under `/v1/logs`. */
export class LogsResource {
  /** Loki-compatible read API. Requires `logs:read`. */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: LogsTransport) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * Reads one page of your organisation's exported request and response bodies.
   * Requires `logs:read_bodies`. Pass the returned `next_cursor` as `cursor` to get the next page.
   *
   * `GET /v1/logs/bodies`
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesPage> {
    return this.http.get<LogBodiesPage>('/v1/logs/bodies', cleanQuery(params));
  }
}
