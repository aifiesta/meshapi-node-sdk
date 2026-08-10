import { MeshAPIApiError } from "./errors.js";
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
   * @default 3
   */
  maxRetries?: number;

}

/**
 * A parsed response object carrying the id of the request that produced it.
 *
 * `_requestId` is attached by the SDK, not returned by the gateway — hence the
 * underscore, which keeps it clearly distinct from the server's own fields. It
 * is **non-enumerable**, so it never appears in `JSON.stringify`,
 * `Object.keys`, object spread or deep-equality comparisons; existing code that
 * serialises or compares responses behaves exactly as before.
 *
 * Arrays and non-objects are passed through untouched — there is nowhere to put
 * the property without corrupting the shape.
 */
export type WithRequestId<T> = T extends object ? T & { readonly _requestId?: string } : T;

/**
 * Attach the response's `x-request-id` to a parsed JSON body.
 *
 * Non-enumerable on purpose: a response object is routinely re-serialised or
 * compared, and an extra visible key would change both.
 */
function attachRequestId<T>(value: T, response: Response): WithRequestId<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value as WithRequestId<T>;
  }
  const requestId = response.headers.get("x-request-id");
  if (!requestId) return value as WithRequestId<T>;
  return Object.defineProperty(value, "_requestId", {
    value: requestId,
    enumerable: false,
  }) as WithRequestId<T>;
}

const RETRY_STATUS_CODES = new Set([429, 502, 503, 504]);
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
/**
 * Single source of truth for the SDK identification header, shared by the HTTP
 * client and the realtime WebSocket resource.
 *
 * `SDK_VERSION_VALUE` must match the `version` field in package.json. It was
 * previously duplicated in `resources/realtime.ts`, which is how it drifted;
 * `tests/sdk-version.test.ts` now asserts it so a release cannot ship a stale
 * value.
 */
export const SDK_VERSION_HEADER = "X-MeshAPI-SDK";
export const SDK_VERSION_VALUE = "node/2.0.0";

// ── HTTP client ───────────────────────────────────────────────────────────────

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultSignal: AbortSignal | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(config: MeshAPIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.defaultTimeoutMs = config.timeoutMs ?? 60_000;
    this.defaultSignal = config.signal;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = config.maxRetries ?? 3;
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

    let attempt = 0;
    while (true) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: form,
        signal: signal as AbortSignal,
      });

      if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
        const delay = this.computeDelay(attempt, this.getRetryAfter(response));
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw await MeshAPIApiError.fromResponse(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const ct = response.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        return (await response.text()) as unknown as T;
      }

      return attachRequestId((await response.json()) as T, response) as T;
    }
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
    const signal = this.buildSignal(opts);

    const init: RequestInit = {
      method,
      headers: this.buildHeaders(),
      signal: signal as AbortSignal,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let attempt = 0;
    while (true) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

      if (response.status === 204) {
        return undefined as T;
      }

      if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
        const delay = this.computeDelay(attempt, this.getRetryAfter(response));
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw await MeshAPIApiError.fromResponse(response);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return (await response.text()) as unknown as T;
      }

      return attachRequestId((await response.json()) as T, response) as T;
    }
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

    let attempt = 0;
    while (true) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

      if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
        const delay = this.computeDelay(attempt, this.getRetryAfter(response));
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw await MeshAPIApiError.fromResponse(response);
      }

      return response;
    }
  }

  private computeDelay(attempt: number, retryAfterMs: number | null): number {
    const baseMs =
      retryAfterMs ?? BACKOFF_BASE_MS * Math.pow(2, attempt);
    const capped = Math.min(baseMs, BACKOFF_MAX_MS);
    const jitter = capped * (0.8 + Math.random() * 0.4); // ±20%
    return jitter;
  }

  private getRetryAfter(response: Response): number | null {
    const header = response.headers.get("retry-after");
    if (!header) return null;
    const seconds = parseFloat(header);
    return isNaN(seconds) ? null : Math.ceil(seconds) * 1000;
  }
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

/** Controls how a raw SSE stream is turned into typed frames. */
export interface SSEParseOptions {
  /**
   * Emit frames whose `type` starts with `"response."` instead of skipping them.
   *
   * The Responses API streams *only* such frames (`response.created`,
   * `response.output_text.delta`, …), so its stream yields nothing unless this
   * is set. Chat completions never emit them, so the default stays `false` and
   * chat callers keep receiving well-typed `ChatCompletionChunk`s.
   */
  emitResponseEvents?: boolean;
}

export async function* parseJSONSSEStream<T>(
  response: Response,
  sseOpts?: SSEParseOptions,
): AsyncIterable<T> {
  if (!response.body) {
    throw new Error("Response body is null; cannot parse SSE stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let remainder = "";
  // Captured once, up front: the caller may abort mid-stream, and this is the
  // id every error raised below falls back to.
  const headerRequestId = response.headers.get("x-request-id") ?? undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffered data
        if (remainder.trim()) {
          const chunk = tryParseJSONSSEFrame<T>(remainder, sseOpts, headerRequestId);
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

        const chunk = tryParseJSONSSEFrame<T>(frame, sseOpts, headerRequestId);
        if (chunk !== null) yield chunk;
      }
    }
  } finally {
    // `releaseLock()` alone does NOT close the body: it detaches the reader and
    // leaves the underlying HTTP response unread, so `break`-ing out of a
    // `for await` (or bailing on a mid-stream error frame) held the socket open
    // and left the provider generating into it. Cancel first, then release.
    try {
      await reader.cancel();
    } catch {
      // Already errored or closed — nothing to release the peer from.
    }
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

function tryParseJSONSSEFrame<T>(
  frame: string,
  sseOpts?: SSEParseOptions,
  fallbackRequestId?: string,
): T | null {
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
      // The frame's own `request_id` wins, but older gateway versions omit it
      // entirely — and by the time a mid-stream error arrives the response
      // headers are the only other place the id survives. Without this fallback
      // the single error a caller most needs to report is the one they cannot
      // identify.
      const fromFrame = typeof parsed["request_id"] === "string" ? parsed["request_id"] : "";
      const requestId = fromFrame || fallbackRequestId || "";
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
    if (
      !sseOpts?.emitResponseEvents &&
      typeof parsed["type"] === "string" &&
      parsed["type"].startsWith("response.")
    ) {
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
 * An SSE stream, plus the id of the request that produced it.
 *
 * The streaming counterpart of {@link WithRequestId}: non-streaming calls carry
 * the id on the returned object as `_requestId`, and a stream carries it here.
 * Either way it lives on what the call returned, so correlating a response to
 * its call is structural — it holds with any number of requests in flight.
 */
export interface SSEStream<T> extends AsyncIterable<T> {
  /**
   * The `x-request-id` of the response backing this stream — quote it when
   * contacting support.
   *
   * Resolves as soon as the response headers arrive, which is *before* the
   * first chunk, so it is available for the whole life of the stream, including
   * after an abort or a mid-stream failure.
   *
   * **Reading this starts the request** if iteration has not already started;
   * the stream itself then reuses that same request rather than issuing a
   * second one.
   *
   * `undefined` if the response carried no such header, or if the request
   * failed before any response arrived. It never rejects — a failing request
   * surfaces through iteration, and duplicating the rejection here would
   * produce an unhandled rejection for callers who only wanted the id.
   *
   * @example
   * ```ts
   * const stream = client.chat.completions.create({ ...params, stream: true });
   * logger.info({ requestId: await stream.requestId }, "stream started");
   * for await (const chunk of stream) { ... }
   * ```
   */
  readonly requestId: Promise<string | undefined>;

  /**
   * Abandon the stream and release the underlying HTTP connection.
   *
   * Only needed when you start a stream and then decide **not** to consume it —
   * in practice, after reading {@link requestId} and bailing out. Reading that
   * property issues the request, and an unread response body keeps the socket
   * open and the provider generating into it until a timeout.
   *
   * Not needed for the normal paths: running a `for await` to completion,
   * `break`ing out of one, or a mid-stream failure all release the connection
   * on their own.
   *
   * Idempotent, never throws, and safe to call at any point — before the
   * response arrives (the in-flight request is aborted), during iteration (the
   * pending `next()` rejects with an abort error), or after completion (a
   * no-op).
   *
   * Also wired to `Symbol.asyncDispose`, so `await using` handles it where the
   * runtime supports explicit resource management.
   *
   * @example
   * ```ts
   * const stream = client.chat.completions.create({ ...params, stream: true });
   * const requestId = await stream.requestId;
   * if (!shouldProceed(requestId)) await stream.cancel();
   * ```
   */
  cancel(): Promise<void>;
}

/**
 * Returns a lazy `SSEStream<ChatCompletionChunk>` that only initiates the
 * streaming POST when the caller begins iterating (or reads `requestId`).
 * Shared by all resources that stream SSE (chat/completions, responses, …) so
 * the lazy-init machinery and iterator protocol live in one place.
 */
export function makeLazySSEIterable<T = ChatCompletionChunk>(
  http: HttpClient,
  path: string,
  params: unknown,
  opts?: RequestOptions,
  sseOpts?: SSEParseOptions,
): SSEStream<T> {
  // Memoised at the *iterable* level, not per-iterator: `requestId` and the
  // iteration have to describe the same HTTP request, and a second
  // [Symbol.asyncIterator]() must not silently issue — and bill for — a second
  // upstream call.
  let started: Promise<{ response: Response; iterator: AsyncIterator<T> }> | null = null;

  // Lets `cancel()` abort a request that has not produced a response yet —
  // reading `requestId` can return control to the caller before headers arrive.
  // Merged with any caller-supplied signal rather than replacing it.
  const controller = new AbortController();
  const streamOpts: RequestOptions = {
    ...opts,
    signal: opts?.signal
      ? AbortSignal.any([opts.signal, controller.signal])
      : controller.signal,
  };

  let cancelled = false;

  const start = (): Promise<{ response: Response; iterator: AsyncIterator<T> }> => {
    if (!started) {
      started = (async () => {
        const response = await http.stream(path, params, streamOpts);
        const gen = parseJSONSSEStream<T>(response, sseOpts);
        return { response, iterator: gen[Symbol.asyncIterator]() };
      })();
    }
    return started;
  };

  const cancel = async (): Promise<void> => {
    if (cancelled) return;
    cancelled = true;
    controller.abort();
    if (!started) return; // Never issued a request — nothing to release.
    try {
      const { response, iterator } = await started;
      // If iteration had begun, closing the generator runs its `finally`, which
      // cancels the reader and with it the body.
      await iterator.return?.(undefined);
      // If it had NOT begun, that call was a no-op: returning a generator
      // suspended at its start never executes the body, so `finally` never
      // runs and the response is still untouched. This is precisely the
      // abandoned-after-reading-requestId case, so cancel the body directly.
      // `locked` distinguishes the two — a started generator holds the reader.
      if (response.body && !response.body.locked) {
        await response.body.cancel();
      }
    } catch {
      // The request itself failed, or the body is already gone. Either way
      // there is no connection left to release.
    }
  };

  return {
    get requestId(): Promise<string | undefined> {
      return start().then(
        ({ response }) => response.headers.get("x-request-id") ?? undefined,
        () => undefined,
      );
    },

    cancel,

    // Explicit resource management (`await using`) where the runtime has it.
    // Declared via computed key so this still compiles on targets whose lib
    // does not define the symbol.
    ...(typeof (Symbol as { asyncDispose?: symbol }).asyncDispose === "symbol"
      ? { [(Symbol as unknown as { asyncDispose: symbol }).asyncDispose]: cancel }
      : {}),

    [Symbol.asyncIterator](): AsyncIterator<T> {
      let iterator: AsyncIterator<T> | null = null;

      return {
        async next(): Promise<IteratorResult<T>> {
          // `start()` is memoised, so this resolves to the same iterator every
          // time — including when `requestId` kicked the request off first.
          if (!iterator) {
            iterator = (await start()).iterator;
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
