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
}

// ── HTTP client ───────────────────────────────────────────────────────────────

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultSignal: AbortSignal | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MeshAPIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.defaultTimeoutMs = config.timeoutMs ?? 60_000;
    this.defaultSignal = config.signal;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
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

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      throw await MeshAPIApiError.fromResponse(response);
    }

    return response.json() as Promise<T>;
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
          const chunk = tryParseSSEFrame(remainder);
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

        const chunk = tryParseSSEFrame(frame);
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

    // Normal chunk — parsed is Record<string,unknown> from isRecord guard; cast via unknown
    return parsed as unknown as ChatCompletionChunk;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
