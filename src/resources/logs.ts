/**
 * Logs resource: read-only, Loki-compatible access to your organisation's
 * request logs under `/v1/logs/loki/api/v1/*`.
 *
 * These are the read paths a Loki client (for example Grafana and its Logs
 * Drilldown) uses. Results are always scoped to the organisation that owns
 * the calling key.
 *
 * Requirements:
 * - The calling key needs the `logs:read` organisation permission.
 *   Data-plane `rsk_` keys are refused with a 401.
 * - A result larger than the server limit is refused with a 422
 *   `log_result_too_large`; narrow the time range or the query and retry.
 *
 * Query parameters follow the Loki HTTP API and are passed through as given.
 */

// ── Logs (Loki-compatible read API) ──────────────────────────────────────────

/** A single query-string value. Arrays are sent as repeated keys. */
export type LokiQueryValue = string | number | boolean | string[] | undefined;

/**
 * Loki query-string parameters, passed through unchanged.
 * Undefined values are omitted. Use the Loki parameter names
 * (for example `query`, `start`, `end`, `limit`, `match[]`).
 */
export type LokiQueryParams = Record<string, LokiQueryValue>;

/** Raw Loki JSON response body. Its shape depends on the endpoint. */
export type LokiResponse = Record<string, unknown>;

/** Minimal transport the logs resource needs: a GET with a query string. */
export interface LogsTransport {
  get<T>(path: string, query?: LokiQueryParams): Promise<T>;
}

const BASE = '/v1/logs/loki/api/v1';

function clean(params?: LokiQueryParams): LokiQueryParams | undefined {
  if (!params) return undefined;
  const out: LokiQueryParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function requireName(name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('name must be a non-empty string');
  }
  return encodeURIComponent(name);
}

export class LogsResource {
  constructor(private readonly http: LogsTransport) {}

  private get<T>(path: string, params?: LokiQueryParams): Promise<T> {
    return this.http.get<T>(`${BASE}${path}`, clean(params));
  }

  /** Run an instant LogQL query. `GET /v1/logs/loki/api/v1/query` */
  query<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/query', params);
  }

  /** Run a LogQL query over a time range. `GET /v1/logs/loki/api/v1/query_range` */
  queryRange<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/query_range', params);
  }

  /** List label names. `GET /v1/logs/loki/api/v1/labels` */
  labels<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/labels', params);
  }

  /** List values of one label. `GET /v1/logs/loki/api/v1/label/{name}/values` */
  labelValues<T = LokiResponse>(name: string, params?: LokiQueryParams): Promise<T> {
    return this.get<T>(`/label/${requireName(name)}/values`, params);
  }

  /** List streams that match selectors. `GET /v1/logs/loki/api/v1/series` */
  series<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/series', params);
  }

  /** List detected labels. `GET /v1/logs/loki/api/v1/detected_labels` */
  detectedLabels<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/detected_labels', params);
  }

  /** List detected fields. `GET /v1/logs/loki/api/v1/detected_fields` */
  detectedFields<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/detected_fields', params);
  }

  /** List values of one detected field. `GET /v1/logs/loki/api/v1/detected_field/{name}/values` */
  detectedFieldValues<T = LokiResponse>(name: string, params?: LokiQueryParams): Promise<T> {
    return this.get<T>(`/detected_field/${requireName(name)}/values`, params);
  }

  /** List log patterns. `GET /v1/logs/loki/api/v1/patterns` */
  patterns<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/patterns', params);
  }

  /** Format a LogQL query. `GET /v1/logs/loki/api/v1/format_query` */
  formatQuery<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/format_query', params);
  }

  /** Get index statistics. `GET /v1/logs/loki/api/v1/index/stats` */
  indexStats<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/index/stats', params);
  }

  /** Get log volume. `GET /v1/logs/loki/api/v1/index/volume` */
  indexVolume<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/index/volume', params);
  }

  /** Get log volume over a time range. `GET /v1/logs/loki/api/v1/index/volume_range` */
  indexVolumeRange<T = LokiResponse>(params?: LokiQueryParams): Promise<T> {
    return this.get<T>('/index/volume_range', params);
  }

  /** Get build information. `GET /v1/logs/loki/api/v1/status/buildinfo` */
  buildInfo<T = LokiResponse>(): Promise<T> {
    return this.get<T>('/status/buildinfo');
  }
}
