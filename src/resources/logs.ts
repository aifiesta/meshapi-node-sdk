import type { HttpClient } from "../http.js";

// ---------------------------------------------------------------------------
// Logs types
// ---------------------------------------------------------------------------

/** A query string value accepted by the logs endpoints. Arrays repeat the key. */
export type LogsQueryValue = string | number | boolean | string[] | undefined;

/**
 * Parameters for `GET /v1/logs/bodies`.
 *
 * Pass the `next_cursor` from a previous page as `cursor` to read the next page.
 * Other filters are forwarded as query parameters.
 */
export interface LogBodiesParams {
  /** Opaque cursor returned as `next_cursor` by the previous page. */
  cursor?: string;
  [key: string]: LogsQueryValue;
}

/** A page of exported request/response bodies for the caller's organization. */
export interface LogBodiesPage {
  /** Cursor for the next page, or `null`/absent when there are no more pages. */
  next_cursor?: string | null;
  [key: string]: unknown;
}

/**
 * Query parameters for the Loki-compatible read endpoints under
 * `/v1/logs/loki/api/v1/*`. Values are forwarded as Loki query parameters
 * (for example `query`, `start`, `end`, `limit`, `direction`, `step`, `match[]`).
 */
export interface LokiQueryParams {
  query?: string;
  start?: string | number;
  end?: string | number;
  limit?: number;
  [key: string]: LogsQueryValue;
}

/** Response envelope returned by the Loki-compatible read endpoints. */
export interface LokiResponse<T = unknown> {
  status?: string;
  data?: T;
  [key: string]: unknown;
}

/** Response of `GET /v1/logs/loki/api/v1/status/buildinfo`. */
export interface LokiBuildInfo {
  version?: string;
  revision?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const LOKI_BASE = "/v1/logs/loki/api/v1";

/**
 * Loki-compatible read access to your organization's request logs.
 *
 * Requires the `logs:read` permission. The tenant is always the calling key's
 * organization.
 */
export class LokiLogsResource {
  constructor(private readonly http: HttpClient) {}

  private read<T>(path: string, params?: object): Promise<T> {
    return this.http.get<T>(`${LOKI_BASE}${path}`, params as Record<string, LogsQueryValue> | undefined);
  }

  /** Run an instant LogQL query (`GET /v1/logs/loki/api/v1/query`). */
  query(params: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/query", params);
  }

  /** Run a LogQL query over a time range (`GET /v1/logs/loki/api/v1/query_range`). */
  queryRange(params: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/query_range", params);
  }

  /** List label names (`GET /v1/logs/loki/api/v1/labels`). */
  labels(params?: LokiQueryParams): Promise<LokiResponse<string[]>> {
    return this.read("/labels", params);
  }

  /** List values for one label (`GET /v1/logs/loki/api/v1/label/{name}/values`). */
  labelValues(name: string, params?: LokiQueryParams): Promise<LokiResponse<string[]>> {
    return this.read(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** List streams matching selectors (`GET /v1/logs/loki/api/v1/series`). */
  series(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/series", params);
  }

  /** List detected fields (`GET /v1/logs/loki/api/v1/detected_fields`). */
  detectedFields(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/detected_fields", params);
  }

  /** List values for one detected field (`GET /v1/logs/loki/api/v1/detected_field/{name}/values`). */
  detectedFieldValues(name: string, params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read(`/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** List detected labels (`GET /v1/logs/loki/api/v1/detected_labels`). */
  detectedLabels(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/detected_labels", params);
  }

  /** List detected log patterns (`GET /v1/logs/loki/api/v1/patterns`). */
  patterns(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/patterns", params);
  }

  /** Format a LogQL query (`GET /v1/logs/loki/api/v1/format_query`). */
  formatQuery(params: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/format_query", params);
  }

  /** Read index statistics (`GET /v1/logs/loki/api/v1/index/stats`). */
  indexStats(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/index/stats", params);
  }

  /** Read log volume (`GET /v1/logs/loki/api/v1/index/volume`). */
  indexVolume(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/index/volume", params);
  }

  /** Read log volume over a time range (`GET /v1/logs/loki/api/v1/index/volume_range`). */
  indexVolumeRange(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.read("/index/volume_range", params);
  }

  /** Read build information (`GET /v1/logs/loki/api/v1/status/buildinfo`). */
  buildInfo(): Promise<LokiBuildInfo> {
    return this.read("/status/buildinfo");
  }
}

/** Access to your organization's request logs. */
export class LogsResource {
  /** Loki-compatible read endpoints (requires `logs:read`). */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * Read your organization's exported request/response bodies
   * (`GET /v1/logs/bodies`).
   *
   * Requires the `logs:read_bodies` permission, which `logs:read` does not imply.
   * Page through results by passing the returned `next_cursor` as `cursor`.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesPage> {
    return this.http.get<LogBodiesPage>("/v1/logs/bodies", params as Record<string, LogsQueryValue> | undefined);
  }
}
