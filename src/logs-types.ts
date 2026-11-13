// ---------------------------------------------------------------------------
// Logs (/v1/logs)
// ---------------------------------------------------------------------------

/** Org permissions added for log access. `logs:read_bodies` is never implied by `logs:read`. */
export type LogsOrgPermission = 'logs:read' | 'logs:read_bodies';

/** Time value accepted by Loki read paths: RFC 3339 string, or Unix timestamp (seconds or nanoseconds). */
export type LokiTime = string | number;

/** Envelope Loki uses for most read responses. */
export interface LokiResponse<T = unknown> {
  status: string;
  data: T;
  [key: string]: unknown;
}

/** Shared time window for Loki read paths. */
export interface LokiTimeRangeParams {
  start?: LokiTime;
  end?: LokiTime;
  since?: string;
}

/** Parameters for `GET /v1/logs/loki/api/v1/query`. */
export interface LokiInstantQueryParams {
  query: string;
  time?: LokiTime;
  limit?: number;
  direction?: 'forward' | 'backward';
}

/** Parameters for `GET /v1/logs/loki/api/v1/query_range`. */
export interface LokiRangeQueryParams extends LokiTimeRangeParams {
  query: string;
  limit?: number;
  step?: string | number;
  interval?: string | number;
  direction?: 'forward' | 'backward';
}

/** Parameters for label, series and detected-field lookups. */
export interface LokiLabelParams extends LokiTimeRangeParams {
  query?: string;
}

/** Parameters for `GET /v1/logs/loki/api/v1/series`. */
export interface LokiSeriesParams extends LokiTimeRangeParams {
  /** One or more stream selectors. */
  match: string | string[];
}

/** Parameters for `GET /v1/logs/loki/api/v1/detected_fields` and detected field values. */
export interface LokiDetectedFieldsParams extends LokiTimeRangeParams {
  query?: string;
  limit?: number;
  line_limit?: number;
}

/** Parameters for `GET /v1/logs/loki/api/v1/index/stats`. */
export interface LokiIndexStatsParams extends LokiTimeRangeParams {
  query: string;
}

/** Parameters for `GET /v1/logs/loki/api/v1/index/volume`. */
export interface LokiVolumeParams extends LokiTimeRangeParams {
  query: string;
  limit?: number;
  targetLabels?: string;
  aggregateBy?: 'series' | 'labels';
}

/** Parameters for `GET /v1/logs/loki/api/v1/index/volume_range`. */
export interface LokiVolumeRangeParams extends LokiVolumeParams {
  step?: string | number;
}

/** Parameters for `GET /v1/logs/loki/api/v1/patterns`. */
export interface LokiPatternsParams extends LokiTimeRangeParams {
  query: string;
  step?: string | number;
}

/** Parameters for `GET /v1/logs/bodies`. */
export interface LogBodiesParams {
  start?: LokiTime;
  end?: LokiTime;
  limit?: number;
  /** Opaque cursor returned as `next_cursor` by the previous page. */
  cursor?: string;
  /** Additional typed filters supported by the endpoint. */
  [filter: string]: string | number | undefined;
}

/** One exported request or response body record. */
export interface LogBodyRecord {
  [key: string]: unknown;
}

/** Response from `GET /v1/logs/bodies`. */
export interface LogBodiesPage {
  data: LogBodyRecord[];
  /** Cursor for the next page, or `null` when there are no more records. */
  next_cursor: string | null;
  [key: string]: unknown;
}
