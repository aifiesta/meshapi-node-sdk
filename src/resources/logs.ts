/**
 * Logs resource: read your organization's request logs.
 *
 * Covers two surfaces:
 *
 * - `GET /v1/logs/bodies`: exported request and response bodies, paged by an
 *   opaque `next_cursor`. Requires the `logs:read_bodies` permission. This
 *   permission is never implied by `logs:read`.
 * - `GET /v1/logs/loki/api/v1/*`: a read-only, Loki-compatible API over your
 *   organization's request records. Point a Grafana Loki data source at
 *   `https://api.meshapi.ai/v1/logs/loki` to use it. Requires the `logs:read`
 *   permission.
 *
 * Every parameter is sent once. The API rejects repeated time or query
 * parameters and LogQL `offset` with a `400`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A time bound: a `Date` (sent as RFC 3339), an RFC 3339 string, or Unix nanoseconds. */
export type LogsTime = Date | string | number;

/** Sort order for log lines. */
export type LogsDirection = 'forward' | 'backward';

/** Minimal transport the logs resource needs. `HttpClient` satisfies it. */
export interface LogsTransport {
  request<T>(
    method: 'GET',
    path: string,
    options?: { query?: Record<string, string> },
  ): Promise<T>;
}

/** Parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  /** Start of the window (inclusive). */
  start?: LogsTime;
  /** End of the window (exclusive). */
  end?: LogsTime;
  /** Maximum number of records per page. */
  limit?: number;
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Additional typed filters accepted by the endpoint. */
  [filter: string]: LogsTime | number | boolean | undefined;
}

/** One exported request/response body record. */
export interface LogBodyRecord {
  [key: string]: unknown;
}

/** A page of exported bodies. */
export interface LogBodiesPage {
  data: LogBodyRecord[];
  /** Pass to `cursor` to fetch the next page; `null` on the last page. */
  next_cursor: string | null;
  [key: string]: unknown;
}

/** Standard Loki response envelope. */
export interface LokiResponse<T> {
  status: 'success' | 'error' | string;
  data: T;
  [key: string]: unknown;
}

/** A stream or metric result from a LogQL query. */
export interface LokiQueryData {
  resultType: 'streams' | 'vector' | 'matrix' | 'scalar' | string;
  result: Array<Record<string, unknown>>;
  stats?: Record<string, unknown>;
}

/** Parameters for `GET /v1/logs/loki/api/v1/query`. */
export interface LokiInstantQueryParams {
  /** LogQL expression. */
  query: string;
  limit?: number;
  time?: LogsTime;
  direction?: LogsDirection;
}

/** Parameters for `GET /v1/logs/loki/api/v1/query_range`. */
export interface LokiRangeQueryParams {
  /** LogQL expression. */
  query: string;
  start?: LogsTime;
  end?: LogsTime;
  since?: string;
  limit?: number;
  /** Resolution step, as a duration (`"1m"`) or seconds. */
  step?: string | number;
  interval?: string | number;
  direction?: LogsDirection;
}

/** A time window, used by label, series and index reads. */
export interface LokiWindowParams {
  start?: LogsTime;
  end?: LogsTime;
  since?: string;
}

/** Parameters for label reads. */
export interface LokiLabelParams extends LokiWindowParams {
  /** Optional stream selector to scope the labels. */
  query?: string;
}

/** Parameters for `GET /v1/logs/loki/api/v1/series`. */
export interface LokiSeriesParams extends LokiWindowParams {
  /** Stream selector, sent as `match[]`. */
  match: string;
}

/** Parameters for selector-scoped reads (patterns, index, detected fields/labels). */
export interface LokiSelectorParams extends LokiWindowParams {
  /** LogQL stream selector or query. */
  query: string;
  step?: string | number;
  limit?: number;
  [key: string]: LogsTime | number | boolean | undefined;
}

/** Response of `GET /v1/logs/loki/api/v1/index/stats`. */
export interface LokiIndexStats {
  streams: number;
  chunks: number;
  bytes: number;
  entries: number;
  [key: string]: unknown;
}

/** One detected log pattern. */
export interface LokiPattern {
  pattern: string;
  samples: Array<[number, number]>;
  [key: string]: unknown;
}

/** Response of `GET /v1/logs/loki/api/v1/detected_fields`. */
export interface LokiDetectedFields {
  fields: Array<{
    label: string;
    type?: string;
    cardinality?: number;
    parsers?: string[] | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** Response of `GET /v1/logs/loki/api/v1/detected_field/{name}/values`. */
export interface LokiDetectedFieldValues {
  values: string[];
  [key: string]: unknown;
}

/** Response of `GET /v1/logs/loki/api/v1/detected_labels`. */
export interface LokiDetectedLabels {
  detectedLabels: Array<{ label: string; cardinality?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Response of `GET /v1/logs/loki/api/v1/status/buildinfo`. */
export interface LokiBuildInfo {
  version?: string;
  revision?: string;
  branch?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOKI_PREFIX = '/v1/logs/loki/api/v1';

type QueryInput = Record<string, LogsTime | boolean | undefined | null>;

/** Serialises parameters, dropping unset values and sending each key once. */
export function toLogsQuery(params: QueryInput | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = value instanceof Date ? value.toISOString() : String(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** Loki-compatible read API over your organization's request records. */
export class LokiLogsResource {
  constructor(private readonly http: LogsTransport) {}

  private get<T>(path: string, params?: QueryInput): Promise<T> {
    return this.http.request<T>('GET', `${LOKI_PREFIX}${path}`, { query: toLogsQuery(params) });
  }

  /** Runs a LogQL query at a single point in time. `GET /v1/logs/loki/api/v1/query` */
  query(params: LokiInstantQueryParams): Promise<LokiResponse<LokiQueryData>> {
    return this.get('/query', { ...params });
  }

  /** Runs a LogQL query over a time range. `GET /v1/logs/loki/api/v1/query_range` */
  queryRange(params: LokiRangeQueryParams): Promise<LokiResponse<LokiQueryData>> {
    return this.get('/query_range', { ...params });
  }

  /** Lists label names. `GET /v1/logs/loki/api/v1/labels` */
  labels(params: LokiLabelParams = {}): Promise<LokiResponse<string[]>> {
    return this.get('/labels', { ...params });
  }

  /** Lists values for one label. `GET /v1/logs/loki/api/v1/label/{name}/values` */
  labelValues(name: string, params: LokiLabelParams = {}): Promise<LokiResponse<string[]>> {
    return this.get(`/label/${encodeURIComponent(name)}/values`, { ...params });
  }

  /** Lists streams matching a selector. `GET /v1/logs/loki/api/v1/series` */
  series(params: LokiSeriesParams): Promise<LokiResponse<Array<Record<string, string>>>> {
    const { match, ...rest } = params;
    return this.get('/series', { 'match[]': match, ...rest });
  }

  /** Lists detected log patterns. `GET /v1/logs/loki/api/v1/patterns` */
  patterns(params: LokiSelectorParams): Promise<LokiResponse<LokiPattern[]>> {
    return this.get('/patterns', { ...params });
  }

  /** Lists fields detected in matching lines. `GET /v1/logs/loki/api/v1/detected_fields` */
  detectedFields(params: LokiSelectorParams): Promise<LokiDetectedFields> {
    return this.get('/detected_fields', { ...params });
  }

  /** Lists values for one detected field. `GET /v1/logs/loki/api/v1/detected_field/{name}/values` */
  detectedFieldValues(name: string, params: LokiSelectorParams): Promise<LokiDetectedFieldValues> {
    return this.get(`/detected_field/${encodeURIComponent(name)}/values`, { ...params });
  }

  /** Lists labels detected in matching streams. `GET /v1/logs/loki/api/v1/detected_labels` */
  detectedLabels(params: LokiSelectorParams): Promise<LokiDetectedLabels> {
    return this.get('/detected_labels', { ...params });
  }

  /** Formats a LogQL expression. `GET /v1/logs/loki/api/v1/format_query` */
  formatQuery(query: string): Promise<LokiResponse<string>> {
    return this.get('/format_query', { query });
  }

  /** Returns index statistics for a selector. `GET /v1/logs/loki/api/v1/index/stats` */
  indexStats(params: LokiSelectorParams): Promise<LokiIndexStats> {
    return this.get('/index/stats', { ...params });
  }

  /** Returns log volume for a selector. `GET /v1/logs/loki/api/v1/index/volume` */
  indexVolume(params: LokiSelectorParams): Promise<LokiResponse<LokiQueryData>> {
    return this.get('/index/volume', { ...params });
  }

  /** Returns log volume over a range. `GET /v1/logs/loki/api/v1/index/volume_range` */
  indexVolumeRange(params: LokiSelectorParams): Promise<LokiResponse<LokiQueryData>> {
    return this.get('/index/volume_range', { ...params });
  }

  /** Returns build information, used by Grafana's connection test. `GET /v1/logs/loki/api/v1/status/buildinfo` */
  buildInfo(): Promise<LokiBuildInfo> {
    return this.get('/status/buildinfo');
  }
}

/** Request logs for your organization. */
export class LogsResource {
  /** Loki-compatible read API (`logs:read`). */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: LogsTransport) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * Reads one page of exported request/response bodies. Requires `logs:read_bodies`.
   * `GET /v1/logs/bodies`
   *
   * @example
   * let page = await client.logs.bodies({ limit: 50 });
   * while (page.next_cursor) {
   *   page = await client.logs.bodies({ limit: 50, cursor: page.next_cursor });
   * }
   */
  bodies(params: LogBodiesParams = {}): Promise<LogBodiesPage> {
    return this.http.request<LogBodiesPage>('GET', '/v1/logs/bodies', {
      query: toLogsQuery({ ...params }),
    });
  }

  /** Iterates every body record across pages, following `next_cursor`. */
  async *iterBodies(params: LogBodiesParams = {}): AsyncGenerator<LogBodyRecord> {
    let cursor = params.cursor;
    do {
      const page = await this.bodies({ ...params, cursor });
      for (const record of page.data ?? []) yield record;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }
}
