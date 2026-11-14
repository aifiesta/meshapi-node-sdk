import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Logs (/v1/logs)
// ---------------------------------------------------------------------------

/** Raw JSON returned by the Loki-compatible `/v1/logs/loki/api/v1/*` routes. */
export type LokiResponse = Record<string, unknown>;

/** Query parameters accepted by the `/v1/logs` read routes. */
export interface LogsQueryParams {
  /** LogQL query. */
  query?: string;
  /** Start of the window (RFC 3339 or Unix epoch). */
  start?: string | number;
  /** End of the window (RFC 3339 or Unix epoch). */
  end?: string | number;
  /** Maximum number of entries to return. */
  limit?: number;
  /** Sort direction of returned entries. */
  direction?: 'forward' | 'backward';
  /** Step for range queries. */
  step?: string | number;
  /** Any other Loki parameter is passed through unchanged. */
  [key: string]: string | number | undefined;
}

/**
 * Read your organisation's request logs.
 *
 * Requires the `logs:read` org permission. `bodies()` also requires
 * `logs:read_bodies`.
 */
export class LogsResource {
  constructor(private readonly http: HttpClient) {}

  private get<T = LokiResponse>(path: string, params?: LogsQueryParams): Promise<T> {
    return this.http.request<T>('GET', path, { query: params });
  }

  /** `GET /v1/logs/bodies` — request and response bodies for logged requests. */
  bodies(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/bodies', params);
  }

  /** `GET /v1/logs/loki/api/v1/query` — run an instant LogQL query. */
  query(params: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/query', params);
  }

  /** `GET /v1/logs/loki/api/v1/query_range` — run a LogQL query over a time range. */
  queryRange(params: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/query_range', params);
  }

  /** `GET /v1/logs/loki/api/v1/labels` — list label names. */
  labels(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/labels', params);
  }

  /** `GET /v1/logs/loki/api/v1/label/{name}/values` — list values of one label. */
  labelValues(name: string, params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get(`/v1/logs/loki/api/v1/label/${encodeURIComponent(name)}/values`, params);
  }

  /** `GET /v1/logs/loki/api/v1/series` — list streams matching a selector. */
  series(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/series', params);
  }

  /** `GET /v1/logs/loki/api/v1/detected_fields` — list fields detected in log lines. */
  detectedFields(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/detected_fields', params);
  }

  /** `GET /v1/logs/loki/api/v1/detected_field/{name}/values` — list values of one detected field. */
  detectedFieldValues(name: string, params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get(
      `/v1/logs/loki/api/v1/detected_field/${encodeURIComponent(name)}/values`,
      params,
    );
  }

  /** `GET /v1/logs/loki/api/v1/detected_labels` — list detected labels. */
  detectedLabels(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/detected_labels', params);
  }

  /** `GET /v1/logs/loki/api/v1/format_query` — format a LogQL query. */
  formatQuery(params: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/format_query', params);
  }

  /** `GET /v1/logs/loki/api/v1/index/stats` — index statistics for a selector. */
  indexStats(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/index/stats', params);
  }

  /** `GET /v1/logs/loki/api/v1/index/volume` — log volume for a selector. */
  indexVolume(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/index/volume', params);
  }

  /** `GET /v1/logs/loki/api/v1/index/volume_range` — log volume over a time range. */
  indexVolumeRange(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/index/volume_range', params);
  }

  /** `GET /v1/logs/loki/api/v1/patterns` — detected log line patterns. */
  patterns(params?: LogsQueryParams): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/patterns', params);
  }

  /** `GET /v1/logs/loki/api/v1/status/buildinfo` — build information of the log backend. */
  buildInfo(): Promise<LokiResponse> {
    return this.get('/v1/logs/loki/api/v1/status/buildinfo');
  }
}

/** Org permissions that gate the logs routes. */
export type LogsOrgPermission = 'logs:read' | 'logs:read_bodies';
