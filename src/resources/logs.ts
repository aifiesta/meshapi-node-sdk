import { compactQuery, type QueryValue, type Transport } from './_transport.js';

// ---------------------------------------------------------------------------
// Logs (Loki-compatible read API)
// ---------------------------------------------------------------------------

/** Org permissions that gate the logs endpoints. */
export type LogsPermission = 'logs:read' | 'logs:read_bodies';

/** Common Loki query parameters. Extra parameters are passed through once each. */
export interface LokiQueryParams {
  query?: string;
  start?: string | number;
  end?: string | number;
  limit?: number;
  direction?: 'forward' | 'backward';
  step?: string | number;
  [key: string]: QueryValue;
}

/** Loki responses are returned as-is. */
export type LokiResponse = Record<string, unknown>;

const LOKI = '/v1/logs/loki/api/v1';

export class LogsResource {
  constructor(private readonly http: Transport) {}

  private get(path: string, params?: Record<string, QueryValue>): Promise<LokiResponse> {
    return this.http.request<LokiResponse>('GET', path, { query: compactQuery(params) });
  }

  /** Read stored request bodies via `GET /v1/logs/bodies`. Requires `logs:read_bodies`. */
  bodies(params?: Record<string, QueryValue>): Promise<LokiResponse> {
    return this.get('/v1/logs/bodies', params);
  }

  /** Run an instant LogQL query via `GET /v1/logs/loki/api/v1/query`. */
  query(params: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/query`, params);
  }

  /** Run a range LogQL query via `GET /v1/logs/loki/api/v1/query_range`. */
  queryRange(params: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/query_range`, params);
  }

  /** List label names via `GET /v1/logs/loki/api/v1/labels`. */
  labels(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/labels`, params);
  }

  /** List values of one label via `GET /v1/logs/loki/api/v1/label/{name}/values`. */
  labelValues(name: string, params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/label/${encodeURIComponent(name)}/values`, params);
  }

  /** List series via `GET /v1/logs/loki/api/v1/series`. */
  series(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/series`, params);
  }

  /** List detected fields via `GET /v1/logs/loki/api/v1/detected_fields`. */
  detectedFields(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/detected_fields`, params);
  }

  /** List values of a detected field via `GET /v1/logs/loki/api/v1/detected_field/{name}/values`. */
  detectedFieldValues(name: string, params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/detected_field/${encodeURIComponent(name)}/values`, params);
  }

  /** List detected labels via `GET /v1/logs/loki/api/v1/detected_labels`. */
  detectedLabels(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/detected_labels`, params);
  }

  /** Format a LogQL query via `GET /v1/logs/loki/api/v1/format_query`. */
  formatQuery(params: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/format_query`, params);
  }

  /** Read index stats via `GET /v1/logs/loki/api/v1/index/stats`. */
  indexStats(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/index/stats`, params);
  }

  /** Read log volume via `GET /v1/logs/loki/api/v1/index/volume`. */
  indexVolume(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/index/volume`, params);
  }

  /** Read log volume over time via `GET /v1/logs/loki/api/v1/index/volume_range`. */
  indexVolumeRange(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/index/volume_range`, params);
  }

  /** Read log patterns via `GET /v1/logs/loki/api/v1/patterns`. */
  patterns(params?: LokiQueryParams): Promise<LokiResponse> {
    return this.get(`${LOKI}/patterns`, params);
  }

  /** Read build info via `GET /v1/logs/loki/api/v1/status/buildinfo`. */
  buildInfo(): Promise<LokiResponse> {
    return this.get(`${LOKI}/status/buildinfo`);
  }
}
