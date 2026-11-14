/**
 * Minimal request contract used by the v1.0.408 resources.
 *
 * The SDK's `HttpClient` is expected to satisfy this shape. Keeping the
 * contract narrow lets these resources be unit-tested with a fake transport.
 */
export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  /** Query string parameters. `undefined` and `null` values are omitted. */
  query?: Record<string, QueryValue>;
  /** JSON request body. */
  body?: unknown;
}

export interface Transport {
  request<T>(method: 'GET' | 'POST', path: string, options?: RequestOptions): Promise<T>;
}

/** Drops `undefined` / `null` entries so each parameter is sent at most once. */
export function compactQuery(
  query: Record<string, QueryValue> | undefined,
): Record<string, QueryValue> | undefined {
  if (!query) return undefined;
  const out: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
