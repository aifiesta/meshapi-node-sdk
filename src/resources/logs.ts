import type { HttpClient } from '../http.js';
import type {
  LogBodiesPage,
  LogBodiesParams,
  LokiDetectedFieldsParams,
  LokiIndexStatsParams,
  LokiInstantQueryParams,
  LokiLabelParams,
  LokiPatternsParams,
  LokiRangeQueryParams,
  LokiResponse,
  LokiSeriesParams,
  LokiVolumeParams,
  LokiVolumeRangeParams,
} from '../logs-types.js';

type Query = Record<string, string | number | string[] | undefined>;

const LOKI = '/v1/logs/loki/api/v1';

function clean(params: object | undefined): Query | undefined {
  if (!params) return undefined;
  const out: Query = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v as string | number | string[];
  }
  return out;
}

/**
 * Read-only Loki-compatible access to your org's request logs.
 *
 * Requires the `logs:read` permission. All methods return Loki's JSON unchanged.
 */
export class LokiResource {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, params?: object): Promise<T> {
    return this.http.request<T>('GET', `${LOKI}${path}`, { query: clean(params) });
  }

  /** Run a LogQL query at a single point in time (`GET /v1/logs/loki/api/v1/query`). */
  query<T = unknown>(params: LokiInstantQueryParams): Promise<LokiResponse<T>> {
    return this.get('/query', params);
  }

  /** Run a LogQL query over a time range (`GET /v1/logs/loki/api/v1/query_range`). */
  queryRange<T = unknown>(params: LokiRangeQueryParams): Promise<LokiResponse<T>> {
    return this.get('/query_range', params);
  }

  /** List label names (`GET /v1/logs/loki/api/v1/labels`). */
  labels(params?: LokiLabelParams): Promise<LokiResponse<string[]>> {
    return this.get('/labels', params);
  }

  /** List values for one label (`GET /v1/logs/loki/api/v1/label/{name}/values`). */
  labelValues(name: string, params?: LokiLabelParams): Promise<LokiResponse<string[]>> {
    return this.get(`/label/${encodeURIComponent(name)}/values`, params);
  }

  /** List streams matching one or more selectors (`GET /v1/logs/loki/api/v1/series`). */
  series(params: LokiSeriesParams): Promise<LokiResponse<Record<string, string>[]>> {
    return this.get('/series', params);
  }

  /** List detected labels (`GET /v1/logs/loki/api/v1/detected_labels`). */
  detectedLabels<T = unknown>(params?: LokiLabelParams): Promise<T> {
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

  /** Format a LogQL query (`GET /v1/logs/loki/api/v1/format_query`). */
  formatQuery(query: string): Promise<LokiResponse<string>> {
    return this.get('/format_query', { query });
  }

  /** Get index statistics for a selector (`GET /v1/logs/loki/api/v1/index/stats`). */
  indexStats<T = unknown>(params: LokiIndexStatsParams): Promise<T> {
    return this.get('/index/stats', params);
  }

  /** Get log volume for a selector (`GET /v1/logs/loki/api/v1/index/volume`). */
  indexVolume<T = unknown>(params: LokiVolumeParams): Promise<LokiResponse<T>> {
    return this.get('/index/volume', params);
  }

  /** Get log volume over a time range (`GET /v1/logs/loki/api/v1/index/volume_range`). */
  indexVolumeRange<T = unknown>(params: LokiVolumeRangeParams): Promise<LokiResponse<T>> {
    return this.get('/index/volume_range', params);
  }

  /** Detect log patterns (`GET /v1/logs/loki/api/v1/patterns`). */
  patterns<T = unknown>(params: LokiPatternsParams): Promise<LokiResponse<T>> {
    return this.get('/patterns', params);
  }

  /** Get Loki build information (`GET /v1/logs/loki/api/v1/status/buildinfo`). */
  buildInfo<T = Record<string, unknown>>(): Promise<T> {
    return this.get('/status/buildinfo');
  }
}

/**
 * Access your org's request logs.
 *
 * @example
 * ```ts
 * const res = await client.logs.loki.queryRange({ query: '{service="mesh"}', since: '1h' });
 * const page = await client.logs.bodies({ limit: 50 });
 * ```
 */
export class LogsResource {
  readonly loki: LokiResource;

  constructor(private readonly http: HttpClient) {
    this.loki = new LokiResource(http);
  }

  /**
   * List your org's exported request and response bodies (`GET /v1/logs/bodies`).
   *
   * Requires the `logs:read_bodies` permission. Pass `next_cursor` from the
   * previous page as `cursor` to read the next page.
   */
  bodies(params?: LogBodiesParams): Promise<LogBodiesPage> {
    return this.http.request<LogBodiesPage>('GET', '/v1/logs/bodies', { query: clean(params) });
  }

  /** Iterate over every body record, following `next_cursor` until it is `null`. */
  async *iterBodies(params: LogBodiesParams = {}): AsyncGenerator<LogBodiesPage['data'][number]> {
    let cursor = params.cursor;
    for (;;) {
      const page = await this.bodies({ ...params, cursor });
      for (const record of page.data ?? []) yield record;
      if (!page.next_cursor) return;
      cursor = page.next_cursor;
    }
  }
}
