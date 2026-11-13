/**
 * Logs resource: read your organisation's request logs.
 *
 * - `client.logs.bodies()` calls `GET /v1/logs/bodies` and returns exported
 *   request/response bodies. It needs the `logs:read_bodies` permission.
 * - `client.logs.loki.*` calls the read-only Loki-compatible API under
 *   `GET /v1/logs/loki/api/v1/*`. It needs the `logs:read` permission. The same
 *   base path can be configured as a Loki data source in Grafana.
 *
 * Results are always scoped to the organisation that owns the API key.
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Minimal transport the logs resource needs. `HttpClient` satisfies it.
 * The path passed to `get` already contains the encoded query string.
 */
export interface LogsTransport {
  get<T>(path: string): Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Organisation permissions that gate the logs endpoints. */
export type LogsOrgPermission = 'logs:read' | 'logs:read_bodies';

/** A timestamp accepted by the logs endpoints: RFC 3339 string, Unix nanoseconds, or a `Date`. */
export type LogsTimestamp = string | number | Date;

/** Query parameter value. Arrays are sent as repeated keys. */
export type LogsQueryValue = string | number | boolean | Date | undefined | null | Array<string | number>;

/** Parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  /** Start of the time window. */
  start?: LogsTimestamp;
  /** End of the time window. */
  end?: LogsTimestamp;
  /** Maximum number of records per page. */
  limit?: number;
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Additional typed filters supported by the endpoint. */
  [key: string]: LogsQueryValue;
}

/** A single exported body record. */
export type LogBodyRecord = Record<string, unknown>;

/** Response from `GET /v1/logs/bodies`. */
export interface LogBodiesResponse {
  data?: LogBodyRecord[];
  /** Cursor for the next page; `null` or absent on the last page. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

/** Standard Loki response envelope. */
export interface LokiResponse<T = unknown> {
  status: string;
  data: T;
  [key: string]: unknown;
}

/** `data` of a Loki `query` / `query_range` response. */
export interface LokiQueryData {
  resultType: string;
  result: unknown[];
  stats?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Parameters for `GET .../query`. */
export interface LokiInstantQueryParams {
  query: string;
  limit?: number;
  time?: LogsTimestamp;
  direction?: 'forward' | 'backward';
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET .../query_range`. */
export interface LokiRangeQueryParams {
  query: string;
  start?: LogsTimestamp;
  end?: LogsTimestamp;
  limit?: number;
  step?: string | number;
  interval?: string | number;
  direction?: 'forward' | 'backward';
  [key: string]: LogsQueryValue;
}

/** Time-window parameters shared by label, series and index endpoints. */
export interface LokiWindowParams {
  start?: LogsTimestamp;
  end?: LogsTimestamp;
  query?: string;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET .../series`. */
export interface LokiSeriesParams {
  /** One or more stream selectors, sent as repeated `match[]`. */
  match: string | string[];
  start?: LogsTimestamp;
  end?: LogsTimestamp;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET .../format_query`. */
export interface LokiFormatQueryParams {
  query: string;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET .../index/volume_range`. */
export interface LokiVolumeRangeParams extends LokiWindowParams {
  step?: string | number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeValue(v: string | number | boolean | Date): string {
  return encodeURIComponent(v instanceof Date ? v.toISOString() : String(v));
}

/** Build a query string; skips `undefined`/`null`, repeats array keys. */
export function buildLogsQuery(params?: Record<string, LogsQueryValue>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const k = encodeURIComponent(key);
    if (Array.isArray(value)) {
      for (const item of value) parts.push(`${k}=${encodeValue(item)}`);
    } else {
      parts.push(`${k}=${encodeValue(value)}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

const LOKI_BASE = '/v1/logs/loki/api/v1';

// ---------------------------------------------------------------------------
// Loki-compatible API
// ---------------------------------------------------------------------------

/**
 * Read-only Loki-compatible API over your organisation's request logs.
 * Every method needs the `logs:read` permission.
 */
export class LokiLogsResource {
  constructor(private readonly http: LogsTransport) {}

  private call<T>(path: string, params?: Record<string, LogsQueryValue>): Promise<T> {
    return this.http.get<T>(`${LOKI_BASE}${path}${buildLogsQuery(params)}`);
  }

  /** Run an instant LogQL query. `GET /v1/logs/loki/api/v1/query` */
  query(params: LokiInstantQueryParams): Promise<LokiResponse<LokiQueryData>> {
    return this.call('/query', params);
  }

  /** Run a LogQL query over a time range. `GET /v1/logs/loki/api/v1/query_range` */
  queryRange(params: LokiRangeQueryParams): Promise<LokiResponse<LokiQueryData>> {
    return this.call('/query_range', params);
  }

  /** List label names. `GET /v1/logs/loki/api/v1/labels` */
  labels(params?: LokiWindowParams): Promise<LokiResponse<string[]>> {
    return this.call('/labels', params);
  }

  /** List values for one label. `GET /v1/logs/loki/api/v1/label/{name}/values` */
  labelValues(name: string, params?: LokiWindowParams): Promise<LokiResponse<string[]>> {
    return this.call(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** List streams matching one or more selectors. `GET /v1/logs/loki/api/v1/series` */
  series(params: LokiSeriesParams): Promise<LokiResponse<Array<Record<string, string>>>> {
    const { match, ...rest } = params;
    return this.call('/series', { ...rest, 'match[]': Array.isArray(match) ? match : [match] });
  }

  /** List detected fields. `GET /v1/logs/loki/api/v1/detected_fields` */
  detectedFields(params?: LokiWindowParams): Promise<Record<string, unknown>> {
    return this.call('/detected_fields', params);
  }

  /** List values for one detected field. `GET /v1/logs/loki/api/v1/detected_field/{name}/values` */
  detectedFieldValues(name: string, params?: LokiWindowParams): Promise<Record<string, unknown>> {
    return this.call(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** List detected labels. `GET /v1/logs/loki/api/v1/detected_labels` */
  detectedLabels(params?: LokiWindowParams): Promise<Record<string, unknown>> {
    return this.call('/detected_labels', params);
  }

  /** Format a LogQL query. `GET /v1/logs/loki/api/v1/format_query` */
  formatQuery(params: LokiFormatQueryParams): Promise<LokiResponse<string>> {
    return this.call('/format_query', params);
  }

  /** Get index statistics. `GET /v1/logs/loki/api/v1/index/stats` */
  indexStats(params: LokiWindowParams): Promise<Record<string, unknown>> {
    return this.call('/index/stats', params);
  }

  /** Get log volume. `GET /v1/logs/loki/api/v1/index/volume` */
  indexVolume(params: LokiWindowParams): Promise<LokiResponse<LokiQueryData>> {
    return this.call('/index/volume', params);
  }

  /** Get log volume over a time range. `GET /v1/logs/loki/api/v1/index/volume_range` */
  indexVolumeRange(params: LokiVolumeRangeParams): Promise<LokiResponse<LokiQueryData>> {
    return this.call('/index/volume_range', params);
  }

  /** Get detected log patterns. `GET /v1/logs/loki/api/v1/patterns` */
  patterns(params: LokiRangeQueryParams): Promise<LokiResponse<unknown[]>> {
    return this.call('/patterns', params);
  }

  /** Get Loki-compatible build info. `GET /v1/logs/loki/api/v1/status/buildinfo` */
  buildInfo(): Promise<Record<string, unknown>> {
    return this.call('/status/buildinfo');
  }
}

// ---------------------------------------------------------------------------
// Logs resource
// ---------------------------------------------------------------------------

export class LogsResource {
  /** Loki-compatible read API (`logs:read`). */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: LogsTransport) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * List exported request/response bodies. `GET /v1/logs/bodies`
   *
   * Needs the `logs:read_bodies` permission, which `logs:read` does not include.
   * Page with `next_cursor`: pass it back as `cursor` until it is empty.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesResponse> {
    return this.http.get<LogBodiesResponse>(`/v1/logs/bodies${buildLogsQuery(params)}`);
  }

  /** Iterate every body record across pages. */
  async *iterBodies(params: LogBodiesParams = {}): AsyncGenerator<LogBodyRecord> {
    let cursor = params.cursor;
    do {
      const page = await this.bodies({ ...params, cursor });
      for (const record of page.data ?? []) yield record;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }
}
