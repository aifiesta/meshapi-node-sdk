import type { HttpClient } from "../http.js";

// ---------------------------------------------------------------------------
// Logs types
// ---------------------------------------------------------------------------

/** Org permissions that gate the logs endpoints. */
export type LogsPermission = "logs:read" | "logs:read_bodies";

/** A query-string value accepted by the logs endpoints. Arrays repeat the key. */
export type LogsQueryValue = string | number | boolean | string[] | undefined;

/** Query-string parameters forwarded to the logs endpoints. */
export type LogsQueryParams = Record<string, LogsQueryValue>;

/** Envelope returned by the Loki-compatible read endpoints. */
export interface LokiResponse<T = unknown> {
  status?: string;
  data?: T;
  [key: string]: unknown;
}

/** Sort direction for Loki log queries. */
export type LokiDirection = "forward" | "backward";

/** Parameters for `GET /v1/logs/loki/api/v1/query`. */
export interface LokiQueryParams {
  /** LogQL query. */
  query: string;
  limit?: number;
  /** Evaluation time (RFC 3339 or Unix nanoseconds). */
  time?: string | number;
  direction?: LokiDirection;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET /v1/logs/loki/api/v1/query_range`. */
export interface LokiQueryRangeParams {
  /** LogQL query. */
  query: string;
  start?: string | number;
  end?: string | number;
  limit?: number;
  step?: string | number;
  interval?: string | number;
  direction?: LokiDirection;
  [key: string]: LogsQueryValue;
}

/** Time window parameters shared by label, series and index endpoints. */
export interface LokiRangeParams {
  start?: string | number;
  end?: string | number;
  since?: string;
  query?: string;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET /v1/logs/loki/api/v1/series`. */
export interface LokiSeriesParams {
  /** One or more stream selectors, sent as repeated `match[]`. */
  match: string | string[];
  start?: string | number;
  end?: string | number;
  since?: string;
  [key: string]: LogsQueryValue;
}

/** Parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  limit?: number;
  start?: string | number;
  end?: string | number;
  [key: string]: LogsQueryValue;
}

/** One page of exported request/response bodies. */
export interface LogBodiesPage {
  data?: Array<Record<string, unknown>>;
  /** Cursor for the next page, or null on the last page. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

const LOKI = "/v1/logs/loki/api/v1";

/** Minimal transport surface this resource uses. */
interface LogsTransport {
  request<T>(options: { method: string; path: string; query?: LogsQueryParams }): Promise<T>;
}

/**
 * Loki-compatible read access to your org's request logs.
 *
 * Every method needs a key holding `logs:read`, except {@link LogsResource.bodies},
 * which needs `logs:read_bodies`.
 */
export class LokiResource {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, query?: LogsQueryParams): Promise<T> {
    return (this.http as unknown as LogsTransport).request<T>({
      method: "GET",
      path: `${LOKI}${path}`,
      query: clean(query),
    });
  }

  /** Runs an instant LogQL query. `GET /v1/logs/loki/api/v1/query` */
  query<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get("/query", params);
  }

  /** Runs a LogQL query over a time range. `GET /v1/logs/loki/api/v1/query_range` */
  queryRange<T = unknown>(params: LokiQueryRangeParams): Promise<LokiResponse<T>> {
    return this.get("/query_range", params);
  }

  /** Lists label names. `GET /v1/logs/loki/api/v1/labels` */
  labels(params?: LokiRangeParams): Promise<LokiResponse<string[]>> {
    return this.get("/labels", params);
  }

  /** Lists values for one label. `GET /v1/logs/loki/api/v1/label/{name}/values` */
  labelValues(name: string, params?: LokiRangeParams): Promise<LokiResponse<string[]>> {
    return this.get(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** Lists streams matching selectors. `GET /v1/logs/loki/api/v1/series` */
  series<T = Array<Record<string, string>>>(params: LokiSeriesParams): Promise<LokiResponse<T>> {
    const { match, ...rest } = params;
    return this.get("/series", { ...rest, "match[]": Array.isArray(match) ? match : [match] });
  }

  /** Returns index statistics for a query. `GET /v1/logs/loki/api/v1/index/stats` */
  indexStats<T = unknown>(params: LokiRangeParams): Promise<T> {
    return this.get("/index/stats", params);
  }

  /** Returns log volume for a query. `GET /v1/logs/loki/api/v1/index/volume` */
  indexVolume<T = unknown>(params: LokiRangeParams): Promise<LokiResponse<T>> {
    return this.get("/index/volume", params);
  }

  /** Returns log volume over a range. `GET /v1/logs/loki/api/v1/index/volume_range` */
  indexVolumeRange<T = unknown>(params: LokiRangeParams): Promise<LokiResponse<T>> {
    return this.get("/index/volume_range", params);
  }

  /** Returns detected log patterns. `GET /v1/logs/loki/api/v1/patterns` */
  patterns<T = unknown>(params: LokiRangeParams): Promise<LokiResponse<T>> {
    return this.get("/patterns", params);
  }

  /** Returns detected fields. `GET /v1/logs/loki/api/v1/detected_fields` */
  detectedFields<T = unknown>(params?: LokiRangeParams): Promise<T> {
    return this.get("/detected_fields", params);
  }

  /** Returns values for one detected field. `GET /v1/logs/loki/api/v1/detected_field/{name}/values` */
  detectedFieldValues<T = unknown>(name: string, params?: LokiRangeParams): Promise<T> {
    return this.get(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** Returns detected labels. `GET /v1/logs/loki/api/v1/detected_labels` */
  detectedLabels<T = unknown>(params?: LokiRangeParams): Promise<T> {
    return this.get("/detected_labels", params);
  }

  /** Formats a LogQL query. `GET /v1/logs/loki/api/v1/format_query` */
  formatQuery(query: string): Promise<LokiResponse<string>> {
    return this.get("/format_query", { query });
  }

  /** Returns build information. `GET /v1/logs/loki/api/v1/status/buildinfo` */
  buildInfo<T = Record<string, unknown>>(): Promise<T> {
    return this.get("/status/buildinfo");
  }
}

/** Access to your org's request logs. */
export class LogsResource {
  /** Loki-compatible read endpoints (needs `logs:read`). */
  readonly loki: LokiResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiResource(http);
  }

  /**
   * Lists your org's exported request/response bodies, one page at a time.
   * Needs `logs:read_bodies`; pass `next_cursor` back as `cursor` for the next page.
   * `GET /v1/logs/bodies`
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesPage> {
    return (this.http as unknown as LogsTransport).request<LogBodiesPage>({
      method: "GET",
      path: "/v1/logs/bodies",
      query: clean(params),
    });
  }
}

function clean(params?: LogsQueryParams): LogsQueryParams | undefined {
  if (!params) return undefined;
  const out: LogsQueryParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
