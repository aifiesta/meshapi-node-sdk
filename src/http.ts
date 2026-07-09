import { MeshAPIApiError } from "./errors.js";
import {
  formatResilienceEvent,
  resolveRetryPolicy,
} from "./resilience.js";
import type {
  FallbackConfig,
  ResilienceEvent,
  ResilienceLogger,
  ResolvedRetryPolicy,
  RetryPolicy,
} from "./resilience.js";
import type { ChatCompletionChunk, RequestOptions } from "./types.js";

// ── Client config ─────────────────────────────────────────────────────────────

export interface MeshAPIConfig {
  /**
   * Base URL of the MeshAPI gateway.
   * @example "https://api.yourdomain.com"
   */
  baseUrl: string;

  /**
   * Bearer token for authentication. One instance = one auth realm.
   *
   * - Data-plane:   `rsk_<ULID>` — for chat completions
   * - Control-plane: `<supabase-jwt>` — for templates, models
   * - Webhook:       `<WEBHOOK_API_KEY>` — for webhook endpoints
   */
  token: string;

  /**
   * Default request timeout in milliseconds.
   * For streaming requests, this applies to the initial connection only (TTFB).
   * @default 60_000
   */
  timeoutMs?: number;

  /**
   * Default AbortSignal for all requests. Per-call signals override this.
   */
  signal?: AbortSignal;

  /**
   * Custom fetch implementation. Defaults to `globalThis.fetch`.
   * Useful for mocking in tests or polyfilling in older environments.
   */
  fetch?: typeof fetch;

  /**
   * Maximum number of retries for 429 and 5xx errors.
   * Streaming requests are never retried.
   * @deprecated Use `retry.maxRetries` — this alias maps onto it.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Transport retry policy: which statuses to retry, backoff shape, whether to
   * honour `Retry-After`, and (opt-in) network-error retry. Streaming requests
   * are never retried.
   *
   * @example
   * ```ts
   * retry: { maxRetries: 5, backoffBaseMs: 250, retryOnStatus: [429, 503] }
   * ```
   */
  retry?: RetryPolicy;

  /**
   * Client-side model-fallback chain for `chat.completions.create`
   * (non-streaming): when the primary model's request exhausts its retries on
   * a transient error, the SDK re-issues it against each model in the chain
   * until one succeeds. Each hop fires a `fallback` event.
   *
   * @example
   * ```ts
   * fallback: { models: ["anthropic/claude-sonnet-5", "openai/gpt-4o-mini"] }
   * ```
   */
  fallback?: FallbackConfig;

  /**
   * Structured sink for resilience events — every transport retry, every
   * fallback hop, and every gateway-side routing outcome (parsed from the
   * `X-Mesh-Routing-*` response headers). Use this to pipe into your own
   * logging framework; use `debug` for ready-made readable lines instead.
   */
  logger?: ResilienceLogger;

  /**
   * Print readable resilience lines to stderr (`[meshapi] retrying POST … `).
   * Gateway-routing lines are printed only when interesting (a retry or a
   * provider fallback actually happened). Independent of `logger`.
   * @default false
   */
  debug?: boolean;
}

const SDK_VERSION_HEADER = "X-MeshAPI-SDK";
const SDK_VERSION_VALUE = "node/0.1.0";

// Gateway routing-outcome headers (FT-244) — present when the API key's
// routing_policy is active. See resilience.ts (GatewayRoutingEvent).
const ROUTING_ATTEMPTS_HEADER = "x-mesh-routing-attempts";
const ROUTING_FALLBACK_HEADER = "x-mesh-routing-fallback";
const SERVED_PROVIDER_HEADER = "x-mesh-served-provider";
const REQUEST_ID_HEADER = "x-request-id";

// ── HTTP client ───────────────────────────────────────────────────────────────

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultSignal: AbortSignal | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: ResolvedRetryPolicy;
  private readonly logger: ResilienceLogger | undefined;
  private readonly debug: boolean;
  /** Chat's client-side model-fallback chain (read by ChatCompletionsResource). */
  readonly fallback: FallbackConfig | undefined;

  constructor(config: MeshAPIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.defaultTimeoutMs = config.timeoutMs ?? 60_000;
    this.defaultSignal = config.signal;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.retry = resolveRetryPolicy(config.retry, config.maxRetries);
    this.fallback = config.fallback;
    this.logger = config.logger;
    this.debug = config.debug ?? false;
  }

  /**
   * Publish a resilience event to the configured `logger` and, with
   * `debug: true`, as a readable stderr line. Gateway-routing lines are only
   * printed when a server-side retry/fallback actually happened; the logger
   * receives every event. Also used by ChatCompletionsResource for fallback hops.
   */
  emit(event: ResilienceEvent): void {
    this.logger?.(event);
    if (!this.debug) return;
    if (event.type === "gateway-routing" && event.attempts <= 1 && !event.fallback) return;
    console.error(`[meshapi] ${formatResilienceEvent(event)}`);
  }

  /**
   * Issue a raw fetch (no auth headers, no retry, no JSON parsing) through the
   * configured `fetchImpl`. Used by `RagResource.uploadFile` to PUT file bytes
   * to a signed URL while still honouring `opts.signal` / `opts.timeoutMs` and
   * any custom fetch implementation supplied via `MeshAPIConfig.fetch`.
   */
  async rawFetch(url: string, init: RequestInit, opts?: RequestOptions): Promise<Response> {
    const signal = this.buildSignal(opts);
    return this.fetchImpl(url, { ...init, signal: signal as AbortSignal });
  }

  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }

  async post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }

  async patch<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, opts);
  }

  async delete(path: string, opts?: RequestOptions): Promise<void> {
    await this.request<void>("DELETE", path, undefined, opts);
  }

  async getBytes(path: string, opts?: RequestOptions): Promise<Uint8Array> {
    const response = await this.requestRaw("GET", path, undefined, opts);
    return new Uint8Array(await response.arrayBuffer());
  }

  async postBytes(path: string, body: unknown, opts?: RequestOptions): Promise<Uint8Array> {
    const response = await this.requestRaw("POST", path, body, opts);
    return new Uint8Array(await response.arrayBuffer());
  }

  async postMultipart<T>(
    path: string,
    fields: Record<string, string | string[]>,
    file?: { name: string; data: Uint8Array | Buffer; contentType?: string },
    opts?: RequestOptions,
  ): Promise<T> {
    const signal = this.buildSignal(opts);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        for (const item of value) form.append(key, item);
      } else {
        form.append(key, value);
      }
    }
    if (file) {
      const blob = new Blob([file.data as BlobPart], { type: file.contentType ?? "application/octet-stream" });
      form.append("file", blob, file.name);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      [SDK_VERSION_HEADER]: SDK_VERSION_VALUE,
      // Do NOT set Content-Type — fetch sets it automatically with the multipart boundary
    };

    const response = await this.sendWithRetry("POST", path, {
      method: "POST",
      headers,
      body: form,
      signal: signal as AbortSignal,
    });

    if (!response.ok) {
      throw await MeshAPIApiError.fromResponse(response);
    }

    return this.parseJsonBody<T>(response);
  }

  /**
   * Initiate a streaming request and return the raw Response.
   * The timeout signal here covers only the initial connection (TTFB);
   * once the stream starts, it is the caller's responsibility to cancel via AbortSignal.
   */
  async stream(path: string, body: unknown, opts?: RequestOptions): Promise<Response> {
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const connectSignal = AbortSignal.timeout(timeoutMs);

    // Merge user signal + TTFB timeout signal
    const signals: AbortSignal[] = [connectSignal];
    if (opts?.signal) signals.push(opts.signal);
    if (this.defaultSignal) signals.push(this.defaultSignal);

    const signal = signals.length === 1 ? signals[0] ?? connectSignal : AbortSignal.any(signals);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw await MeshAPIApiError.fromResponse(response);
    }

    return response;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      [SDK_VERSION_HEADER]: SDK_VERSION_VALUE,
    };
  }

  private buildSignal(opts?: RequestOptions): AbortSignal {
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    const signals: AbortSignal[] = [timeoutSignal];
    if (opts?.signal) signals.push(opts.signal);
    if (this.defaultSignal) signals.push(this.defaultSignal);

    return signals.length === 1 ? signals[0] ?? timeoutSignal : AbortSignal.any(signals);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const response = await this.requestRaw(method, path, body, opts);
    return this.parseJsonBody<T>(response);
  }

  private async requestRaw(
    method: string,
    path: string,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<Response> {
    const signal = this.buildSignal(opts);

    const init: RequestInit = {
      method,
      headers: this.buildHeaders(),
      signal: signal as AbortSignal,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await this.sendWithRetry(method, path, init);

    if (!response.ok) {
      throw await MeshAPIApiError.fromResponse(response);
    }

    return response;
  }

  /**
   * The single transport retry loop shared by every non-streaming request
   * (JSON, raw-bytes, and multipart). Re-sends on the policy's status set
   * (and, opt-in, on pre-response network errors), with exponential backoff,
   * jitter, and `Retry-After` support. Emits a `retry` event per re-send and a
   * `gateway-routing` event when the final response carries `X-Mesh-Routing-*`
   * headers. Returns the final Response — callers handle non-ok statuses.
   */
  private async sendWithRetry(method: string, path: string, init: RequestInit): Promise<Response> {
    const { maxRetries, retryOnStatus, retryOnNetworkError } = this.retry;
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
      } catch (err) {
        // Aborts (user cancel / timeout) always propagate. Other pre-response
        // failures (DNS, connection refused/reset) retry only when opted in —
        // they are ambiguous for non-idempotent POSTs.
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort || !retryOnNetworkError || attempt >= maxRetries) {
          throw err;
        }
        const delayMs = this.computeDelay(attempt, null);
        this.emit({
          type: "retry",
          method,
          path,
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          reason: "network-error",
        });
        await sleep(delayMs);
        attempt++;
        continue;
      }

      if (retryOnStatus.has(response.status) && attempt < maxRetries) {
        const delayMs = this.computeDelay(attempt, this.getRetryAfter(response));
        this.emit({
          type: "retry",
          method,
          path,
          attempt: attempt + 1,
          maxRetries,
          status: response.status,
          requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
          delayMs,
          reason: "status",
        });
        await sleep(delayMs);
        attempt++;
        continue;
      }

      this.emitGatewayRouting(path, response);
      return response;
    }
  }

  /**
   * Surface the gateway's own routing outcome (server-side retry / provider
   * fallback, FT-244) when the response reports it. Header-absence means the
   * key has no active routing policy — nothing is emitted.
   */
  private emitGatewayRouting(path: string, response: Response): void {
    const attempts = response.headers.get(ROUTING_ATTEMPTS_HEADER);
    if (attempts === null) return;
    this.emit({
      type: "gateway-routing",
      path,
      attempts: Number(attempts) || 1,
      fallback: response.headers.get(ROUTING_FALLBACK_HEADER) === "true",
      servedProvider: response.headers.get(SERVED_PROVIDER_HEADER) ?? undefined,
      requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
    });
  }

  private async parseJsonBody<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return (await response.text()) as unknown as T;
    }
    return response.json() as Promise<T>;
  }

  private computeDelay(attempt: number, retryAfterMs: number | null): number {
    const baseMs = retryAfterMs ?? this.retry.backoffBaseMs * Math.pow(2, attempt);
    const capped = Math.min(baseMs, this.retry.backoffMaxMs);
    const jitter = capped * (0.8 + Math.random() * 0.4); // ±20%
    return jitter;
  }

  private getRetryAfter(response: Response): number | null {
    if (!this.retry.respectRetryAfter) return null;
    const header = response.headers.get("retry-after");
    if (!header) return null;
    const seconds = parseFloat(header);
    return isNaN(seconds) ? null : Math.ceil(seconds) * 1000;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SSE parser ────────────────────────────────────────────────────────────────

/**
 * Parse a Server-Sent Events stream from a fetch Response into an async
 * iterable of typed chat completion chunks.
 *
 * Handles:
 * - Partial chunks (remainder buffer strategy)
 * - [DONE] sentinel — stops iteration
 * - Mid-stream error frames — throws MeshAPIApiError
 * - TextDecoder with `fatal: false` to survive binary padding bytes
 */
export async function* parseSSEStream(
  response: Response,
): AsyncIterable<ChatCompletionChunk> {
  yield* parseJSONSSEStream<ChatCompletionChunk>(response);
}

export async function* parseJSONSSEStream<T>(
  response: Response,
): AsyncIterable<T> {
  if (!response.body) {
    throw new Error("Response body is null; cannot parse SSE stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let remainder = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffered data
        if (remainder.trim()) {
          const chunk = tryParseJSONSSEFrame<T>(remainder);
          if (chunk !== null) yield chunk;
        }
        break;
      }

      // Decode the new bytes and append to remainder
      remainder += decoder.decode(value, { stream: true });

      // Split on double-newline (SSE frame delimiter)
      const frames = remainder.split("\n\n");

      // Last element is the incomplete frame (or empty string) — keep as new remainder
      remainder = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.trim()) continue;

        // Break early if we see the [DONE] sentinel
        const lines = frame.split("\n");
        const isDone = lines.some(line => line.startsWith("data: ") && line.slice(6).trim() === "[DONE]");
        if (isDone) {
          return;
        }

        const chunk = tryParseJSONSSEFrame<T>(frame);
        if (chunk !== null) yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE frame string into a ChatCompletionChunk.
 * Returns null if the frame is the [DONE] sentinel or has no data lines.
 * Throws MeshAPIApiError if the frame contains an error payload.
 */
function tryParseSSEFrame(frame: string): ChatCompletionChunk | null {
  return tryParseJSONSSEFrame<ChatCompletionChunk>(frame);
}

function tryParseJSONSSEFrame<T>(frame: string): T | null {
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6).trim());
    }
  }

  if (dataLines.length === 0) return null;

  for (const data of dataLines) {
    if (data === "[DONE]") return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Malformed JSON in SSE frame — skip silently
      continue;
    }

    if (!isRecord(parsed)) continue;

    // Mid-stream error frame: server sends {error: {code, message}} before [DONE]
    if ("error" in parsed && isRecord(parsed["error"])) {
      const err = parsed["error"];
      const requestId =
        typeof parsed["request_id"] === "string" ? parsed["request_id"] : "";
      throw new MeshAPIApiError(0, {
        error: {
          code: typeof err["code"] === "string" ? err["code"] : "upstream_error",
          message:
            typeof err["message"] === "string"
              ? err["message"]
              : "An upstream error occurred in the stream.",
        },
        request_id: requestId,
      });
    }

    // Responses API emits lifecycle/reasoning events whose `type` field starts
    // with "response." (e.g. "response.reasoning_text.delta"). These are not
    // chat-completion-chunk shaped; skip them so callers always receive a
    // well-typed ChatCompletionChunk rather than a miscast object.
    if (typeof parsed["type"] === "string" && parsed["type"].startsWith("response.")) {
      continue;
    }

    // Normal chunk — parsed is Record<string,unknown> from isRecord guard; cast via unknown
    return parsed as unknown as T;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Lazy SSE iterable helper ───────────────────────────────────────────────────

/**
 * Returns a lazy `AsyncIterable<ChatCompletionChunk>` that only initiates the
 * streaming POST when the caller begins iterating. Shared by all resources that
 * stream SSE (chat/completions, responses, …) so the lazy-init machinery and
 * iterator protocol live in one place.
 */
export function makeLazySSEIterable<T = ChatCompletionChunk>(
  http: HttpClient,
  path: string,
  params: unknown,
  opts?: RequestOptions,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let iterator: AsyncIterator<T> | null = null;

      const init = async (): Promise<AsyncIterator<T>> => {
        const response = await http.stream(path, params, opts);
        const gen = parseJSONSSEStream<T>(response);
        return gen[Symbol.asyncIterator]();
      };

      return {
        async next(): Promise<IteratorResult<T>> {
          // `init()` is called at most once: `for await...of` — the only
          // sensible consumer of an SSE stream — awaits each next() before
          // issuing the next, so concurrent calls here are unreachable.
          if (!iterator) {
            iterator = await init();
          }
          return iterator.next();
        },
        async return(value?: unknown): Promise<IteratorResult<T>> {
          if (iterator?.return) {
            return iterator.return(value);
          }
          return { done: true, value: undefined as unknown as T };
        },
        async throw(err?: unknown): Promise<IteratorResult<T>> {
          if (iterator?.throw) {
            return iterator.throw(err);
          }
          throw err;
        },
      };
    },
  };
}
