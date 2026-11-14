import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Logs types (GET /v1/logs/bodies, GET /v1/logs/loki/api/v1/*)
// ---------------------------------------------------------------------------

/** Org permissions that gate the logs read surface. */
export type LogsOrgPermission = 'logs:read' | 'logs:read_bodies';

/**
 * Query parameters forwarded to a Loki-compatible read endpoint.
 * Send each parameter once: a repeated time or query parameter is refused with `400`.
 */
export type LokiQueryParams = Record<string, string | number | boolean | undefined>;

/** Loki-style response envelope. `data` is passed through as returned by the API. */
export interface LokiResponse<T = unknown> {
  status?: string;
  data?: T;
  [key: string]: unknown;
}

/** Query parameters for `GET /v1/logs/bodies`. */
export type LogBodiesParams = Record<string, string | number | boolean | undefined>;

/** Response from `GET /v1/logs/bodies`. Requires the `logs:read_bodies` permission. */
export interface LogBodiesResponse {
  [key: string]: unknown;
}

function cleanQuery(params?: Record<string, string | number | boolean | undefined>): Record<string, string> | undefined {
  if (!params) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

function segment(name: string): string {
  if (!name) throw new Error('name must be a non-empty string');
  return encodeURIComponent(name);
}

/**
 * Loki-compatible log reads under `/v1/logs/loki/api/v1`.
 * Requires the `logs:read` permission.
 */
export class LokiLogsResource {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.http.request<LokiResponse<T>>({
      method: 'GET',
      path: `/v1/logs/loki/api/v1${path}`,
      query: cleanQuery(params),
    });
  }

  /** Run an instant LogQL query (`GET /v1/logs/loki/api/v1/query`). */
  query<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/query', params);
  }

  /** Run a LogQL query over a time range (`GET /v1/logs/loki/api/v1/query_range`). */
  queryRange<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/query_range', params);
  }

  /** List label names (`GET /v1/logs/loki/api/v1/labels`). */
  labels<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/labels', params);
  }

  /** List values for one label (`GET /v1/logs/loki/api/v1/label/{name}/values`). */
  labelValues<T = unknown>(name: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>(`/label/${segment(name)}/values`, params);
  }

  /** List matching series (`GET /v1/logs/loki/api/v1/series`). */
  series<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/series', params);
  }

  /** Detect log patterns (`GET /v1/logs/loki/api/v1/patterns`). */
  patterns<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/patterns', params);
  }

  /** List detected fields (`GET /v1/logs/loki/api/v1/detected_fields`). */
  detectedFields<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/detected_fields', params);
  }

  /** List values for one detected field (`GET /v1/logs/loki/api/v1/detected_field/{name}/values`). */
  detectedFieldValues<T = unknown>(name: string, params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>(`/detected_field/${segment(name)}/values`, params);
  }

  /** List detected labels (`GET /v1/logs/loki/api/v1/detected_labels`). */
  detectedLabels<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/detected_labels', params);
  }

  /** Format a LogQL query (`GET /v1/logs/loki/api/v1/format_query`). */
  formatQuery<T = unknown>(params: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/format_query', params);
  }

  /** Read index statistics (`GET /v1/logs/loki/api/v1/index/stats`). */
  indexStats<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/stats', params);
  }

  /** Read index volume (`GET /v1/logs/loki/api/v1/index/volume`). */
  indexVolume<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/volume', params);
  }

  /** Read index volume over a range (`GET /v1/logs/loki/api/v1/index/volume_range`). */
  indexVolumeRange<T = unknown>(params?: LokiQueryParams): Promise<LokiResponse<T>> {
    return this.get<T>('/index/volume_range', params);
  }

  /** Read build information (`GET /v1/logs/loki/api/v1/status/buildinfo`). */
  buildInfo<T = unknown>(): Promise<LokiResponse<T>> {
    return this.get<T>('/status/buildinfo');
  }
}

/** Request log reads for the caller's org. */
export class LogsResource {
  /** Loki-compatible reads. */
  readonly loki: LokiLogsResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiLogsResource(http);
  }

  /**
   * Read request and response bodies (`GET /v1/logs/bodies`).
   * Requires the `logs:read_bodies` permission.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesResponse> {
    return this.http.request<LogBodiesResponse>({
      method: 'GET',
      path: '/v1/logs/bodies',
      query: cleanQuery(params),
    });
  }
}
