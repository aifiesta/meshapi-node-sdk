// ── Resilience: retry policy, fallback chain, and observability events ───────
//
// Two independent layers, mirroring the gateway's design:
//
//  1. TRANSPORT RETRY (HttpClient): re-send the same request on transient
//     failures (429/502/503/504, optionally network errors). Configured via
//     `MeshAPIConfig.retry`. Streaming requests are never retried.
//
//  2. MODEL FALLBACK (chat.completions.create): after the transport gives up,
//     try the same request against the next model in a configured chain.
//     Configured via `MeshAPIConfig.fallback` or per-call `fallbackModels`.
//     Client-side only — the gateway additionally does its own server-side
//     retry + cross-provider fallback when the API key's `routing_policy`
//     enables it; that outcome is reported back via `X-Mesh-Routing-*`
//     response headers and surfaced as a `gateway-routing` event.
//
// Every retry, fallback hop, and gateway-routing outcome is observable through
// `MeshAPIConfig.logger` (structured events) and/or `debug: true` (readable
// stderr lines), so it is always clear which requests were retried and which
// were served by a fallback.

/** Transport-level retry policy. All fields optional — unset fields keep the defaults. */
export interface RetryPolicy {
  /**
   * Maximum number of retries after the initial attempt.
   * @default 3
   */
  maxRetries?: number;

  /**
   * HTTP status codes that trigger a retry of the same request.
   * @default [429, 502, 503, 504]
   */
  retryOnStatus?: number[];

  /**
   * Base delay for exponential backoff (doubles per attempt, ±20% jitter).
   * @default 500
   */
  backoffBaseMs?: number;

  /**
   * Upper bound on a single backoff delay.
   * @default 30_000
   */
  backoffMaxMs?: number;

  /**
   * Honour the server's `Retry-After` response header when present.
   * @default true
   */
  respectRetryAfter?: boolean;

  /**
   * Also retry when the request fails before any response arrives (DNS
   * failure, connection refused/reset). Off by default: a network error is
   * ambiguous — the request may have reached the server, and POST bodies are
   * not idempotent. Timeouts/aborts are never retried.
   * @default false
   */
  retryOnNetworkError?: boolean;
}

/** Resolved retry policy with every field populated. */
export interface ResolvedRetryPolicy {
  maxRetries: number;
  retryOnStatus: Set<number>;
  backoffBaseMs: number;
  backoffMaxMs: number;
  respectRetryAfter: boolean;
  retryOnNetworkError: boolean;
}

export const DEFAULT_RETRY_STATUS_CODES = [429, 502, 503, 504] as const;
export const DEFAULT_FALLBACK_STATUS_CODES = [502, 503, 504] as const;

export function resolveRetryPolicy(
  policy: RetryPolicy | undefined,
  legacyMaxRetries: number | undefined,
): ResolvedRetryPolicy {
  return {
    // `retry.maxRetries` wins over the deprecated top-level `maxRetries`.
    maxRetries: policy?.maxRetries ?? legacyMaxRetries ?? 3,
    retryOnStatus: new Set(policy?.retryOnStatus ?? DEFAULT_RETRY_STATUS_CODES),
    backoffBaseMs: policy?.backoffBaseMs ?? 500,
    backoffMaxMs: policy?.backoffMaxMs ?? 30_000,
    respectRetryAfter: policy?.respectRetryAfter ?? true,
    retryOnNetworkError: policy?.retryOnNetworkError ?? false,
  };
}

/** Client-side model-fallback chain for `chat.completions.create` (non-streaming). */
export interface FallbackConfig {
  /**
   * Ordered list of models to try when the primary model's request fails.
   * Distinct from the `models` request param (a server-side, provider-handled
   * fallback list): this chain is driven by the SDK, so it works regardless of
   * provider and is visible in your logs hop by hop.
   */
  models: string[];

  /**
   * Error statuses eligible for advancing to the next model. Terminal errors
   * (auth, validation, billing) never advance the chain.
   * @default [502, 503, 504]
   */
  onStatus?: number[];
}

// ── Observability events ──────────────────────────────────────────────────────

/** The same request is being re-sent after a transient failure. */
export interface RetryEvent {
  type: "retry";
  method: string;
  path: string;
  /** 1-based attempt that just failed; the next send is attempt + 1. */
  attempt: number;
  maxRetries: number;
  /** HTTP status that triggered the retry; undefined for a network error. */
  status?: number | undefined;
  /** Gateway request id of the failed attempt, when a response was received. */
  requestId?: string | undefined;
  delayMs: number;
  reason: "status" | "network-error";
}

/** The chat fallback chain is advancing to the next model. */
export interface FallbackEvent {
  type: "fallback";
  fromModel: string;
  toModel: string;
  /** 0-based index of `toModel` within the configured chain. */
  chainIndex: number;
  chainLength: number;
  status?: number | undefined;
  errorCode?: string | undefined;
  requestId?: string | undefined;
}

/**
 * The GATEWAY retried or fell back server-side while serving this request —
 * parsed from the `X-Mesh-Routing-*` response headers (present when the API
 * key's `routing_policy` is active). `fallback: true` means a different
 * provider than the primary served the request.
 */
export interface GatewayRoutingEvent {
  type: "gateway-routing";
  path: string;
  attempts: number;
  fallback: boolean;
  servedProvider?: string | undefined;
  requestId?: string | undefined;
}

export type ResilienceEvent = RetryEvent | FallbackEvent | GatewayRoutingEvent;

/** Structured event sink. Receives every retry, fallback hop, and gateway-routing outcome. */
export type ResilienceLogger = (event: ResilienceEvent) => void;

// ── Built-in debug printer ────────────────────────────────────────────────────

/**
 * Render an event as a single readable line, e.g.
 *   `retrying POST /v1/chat/completions (attempt 1/3 failed: 503, next in 512ms) [req_abc]`
 *   `falling back openai/gpt-4o → anthropic/claude-sonnet-5 (1/2: 503 provider_not_available)`
 *   `gateway served /v1/chat/completions via bedrock (2 attempts, provider fallback) [req_abc]`
 */
export function formatResilienceEvent(event: ResilienceEvent): string {
  const rid = event.requestId ? ` [${event.requestId}]` : "";
  switch (event.type) {
    case "retry": {
      const why = event.reason === "network-error" ? "network error" : String(event.status);
      return (
        `retrying ${event.method} ${event.path} ` +
        `(attempt ${event.attempt}/${event.maxRetries + 1} failed: ${why}, ` +
        `next in ${Math.round(event.delayMs)}ms)${rid}`
      );
    }
    case "fallback": {
      const why = [event.status, event.errorCode].filter(Boolean).join(" ");
      return (
        `falling back ${event.fromModel} → ${event.toModel} ` +
        `(${event.chainIndex + 1}/${event.chainLength}: ${why || "network error"})${rid}`
      );
    }
    case "gateway-routing": {
      const served = event.servedProvider ? ` via ${event.servedProvider}` : "";
      const detail = event.fallback
        ? `${event.attempts} attempts, provider fallback`
        : `${event.attempts} attempts`;
      return `gateway served ${event.path}${served} (${detail})${rid}`;
    }
  }
}
