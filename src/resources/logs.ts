import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Logs types
// ---------------------------------------------------------------------------

/** Organisation permissions that gate the logs endpoints. */
export type LogsPermission = 'logs:read' | 'logs:read_bodies';

/** A timestamp accepted by the logs endpoints: RFC 3339 string or Unix nanoseconds. */
export type LogTimestamp = string | number;

/** Query parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  /** Start of the time window. */
  start?: LogTimestamp;
  /** End of the time window. */
  end?: LogTimestamp;
  /** Maximum number of records to return. */
  limit?: number;
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Additional typed filters supported by the endpoint. */
  [key: string]: string | number | boolean | undefined;
}

/** One page of exported request/response bodies. */
export interface LogBodiesPage {
  data: Array<Record<string, unknown>>;
  /** Cursor for the next page, or `null` when there are no more records. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

/** Generic Loki API response envelope. */
export interface LokiResponse<T = unknown> {
  status?: string;
  data?: T;
  [key: string]: unknown;
}

/** Parameters for an instant log query. */
export interface LokiQueryParams {
  query: string;
  limit?: number;
  time?: LogTimestamp;
  direction?: 'forward' | 'backward';
}

/** Parameters for a range log query. */
export interface LokiQueryRangeParams {
  query: string;
  start?: LogTimestamp;
  end?: LogTimestamp;
  limit?: number;
  step?: string | number;
  interval?: string | number;
  direction?: 'forward' | 'backward';
}

/** Parameters bounded by a time window and an optional selector. */
export interface LokiWindowParams {
  query?: string;
  start?: LogTimestamp;
  end?: LogTimestamp;
  since?: string;
}

/** Parameters for detected fields and detected field values. */
export interface LokiDetectedFieldsParams extends LokiWindowParams {
  limit?: number;
  line_limit?: number;
}

/** Parameters for `GET .../series`. */
export interface LokiSeriesParams {
  /** One or more stream selectors, sent as `match[]`. */
  match: string | string[];
  start?: LogTimestamp;
  end?: LogTimestamp;
}

/** Parameters for `GET .../patterns`. */
export interface LokiPatternsParams {
  query: string;
  start?: LogTimestamp;
  end?: LogTimestamp;
  step?: string | number;
}

/** Parameters for index stats. */
export interface LokiIndexStatsParams {
  query: string;
  start?: LogTimestamp;
  end?: LogTimestamp;
}

/** Parameters for index volume and volume range. */
export interface LokiIndexVolumeParams {
  query: string;
  start?: LogTimestamp;
  end?: LogTimestamp;
  limit?: number;
  step?: string | number;
  targetLabels?: string;
  aggregateBy?: 'series' | 'labels';
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

const LOKI_BASE = '/v1/logs/loki/api/v1';

function clean(params: object | undefined): Query | undefined {
  if (!params) return undefined;
  const out: Query = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v as Query[string];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/**
 * Read-only Loki-compatible API over your organisation's request logs.
 *
 * Requires a key holding the `logs:read` permission.
 */
export class LokiLogsResource {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, params?: object): Promise<T> {
    return this.http.get<T>(`${LOKI_BASE}${path}`, { query: clean(params) });
  }

  /** Run an instant LogQL query (`GET /v1/logs/loki/api/v1/query`). */
  query<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get('/query', params);
  }

  /** Run a LogQL query over a time range (`GET /v1/logs/loki/api/v1/query_range`). */
  queryRange<T = unknown>(params: LokiQueryRangeParams): Promise<LokiResponse<T>> {
    return this.get('/query_range', params);
  }

  /** List label names (`GET /v1/logs/loki/api/v1/labels`). */
  labels(params?: LokiWindowParams): Promise<LokiResponse<string[]>> {
    return this.get('/labels', params);
  }

  /** List values for one label (`GET /v1/logs/loki/api/v1/label/{name}/values`). */
  labelValues(name: string, params?: LokiWindowParams): Promise<LokiResponse<string[]>> {
    return this.get(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** List streams matching one or more selectors (`GET /v1/logs/loki/api/v1/series`). */
  series(params: LokiSeriesParams): Promise<LokiResponse<Array<Record<string, string>>>> {
    const { match, ...rest } = params;
    return this.get('/series', { ...rest, 'match[]': Array.isArray(match) ? match : [match] });
  }

  /** List detected labels (`GET /v1/logs/loki/api/v1/detected_labels`). */
  detectedLabels<T = unknown>(params?: LokiWindowParams): Promise<T> {
    return this.get('/detected_labels', params);
  }

  /** List detected fields (`GET /v1/logs/loki/api/v1/detected_fields`). */
  detectedFields<T = unknown>(params?: LokiDetectedFieldsParams): Promise<T> {
    return this.get('/detected_fields', params);
  }

  /** List values for one detected field (`GET /v1/logs/loki/api/v1/detected_field/{name}/values`). */
  detectedFieldValues<T = unknown>(name: string, params?: LokiDetectedFieldsParams): Promise<T> {
    return this.get(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** List log patterns (`GET /v1/logs/loki/api/v1/patterns`). */
  patterns<T = unknown>(params: LokiPatternsParams): Promise<LokiResponse<T>> {
    return this.get('/patterns', params);
  }

  /** Format a LogQL query (`GET /v1/logs/loki/api/v1/format_query`). */
  formatQuery(query: string): Promise<LokiResponse<string>> {
    return this.get('/format_query', { query });
  }

  /** Get index statistics (`GET /v1/logs/loki/api/v1/index/stats`). */
  indexStats<T = unknown>(params: LokiIndexStatsParams): Promise<T> {
    return this.get('/index/stats', params);
  }

  /** Get log volume (`GET /v1/logs/loki/api/v1/index/volume`). */
  indexVolume<T = unknown>(params: LokiIndexVolumeParams): Promise<LokiResponse<T>> {
    return this.get('/index/volume', params);
  }

  /** Get log volume over a range (`GET /v1/logs/loki/api/v1/index/volume_range`). */
  indexVolumeRange<T = unknown>(params: LokiIndexVolumeParams): Promise<LokiResponse<T>> {
    return this.get('/index/volume_range', params);
  }

  /** Get build information (`GET /v1/logs/loki/api/v1/status/buildinfo`). */
  buildInfo<T = Record<string, unknown>>(): Promise<T> {
    return this.get('/status/buildinfo');
  }
}

/** Access to your organisation's request logs. */
export class LogsResource {
  /** Loki-compatible read API. Requires `logs:read`. */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * List exported request and response bodies (`GET /v1/logs/bodies`).
   *
   * Requires `logs:read_bodies`, which `logs:read` does not imply.
   * Pass the returned `next_cursor` as `cursor` to read the next page.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesPage> {
    return this.http.get<LogBodiesPage>('/v1/logs/bodies', { query: clean(params) });
  }
}
