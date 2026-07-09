import { MeshAPIApiError } from "../errors.js";
import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
import { DEFAULT_FALLBACK_STATUS_CODES } from "../resilience.js";
import type {
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResponse,
  RequestOptions,
} from "../types.js";

// ── Completions sub-resource ──────────────────────────────────────────────────

export class ChatCompletionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a chat completion (non-streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const response = await client.chat.completions.create({
   *   model: "openai/gpt-4o-mini",
   *   messages: [{ role: "user", content: "Hello!" }],
   * });
   * console.log(response.choices[0]?.message.content);
   * ```
   */
  create(
    params: ChatCompletionParams & { stream?: false },
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse>;

  /**
   * Create a chat completion (streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * Returns an `AsyncIterable<ChatCompletionChunk>` that yields SSE frames
   * as they arrive. Throws `MeshAPIApiError` on mid-stream error frames.
   *
   * @example
   * ```ts
   * const stream = client.chat.completions.create({
   *   model: "openai/gpt-4o-mini",
   *   messages: [{ role: "user", content: "Tell me a story." }],
   *   stream: true,
   * });
   *
   * for await (const chunk of stream) {
   *   const text = chunk.choices[0]?.delta.content ?? "";
   *   process.stdout.write(text);
   * }
   * ```
   */
  create(
    params: ChatCompletionParams & { stream: true },
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk>;

  create(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse> | AsyncIterable<ChatCompletionChunk>;

  create(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse> | AsyncIterable<ChatCompletionChunk> {
    // fallbackModels is a client-side directive — never sent to the server.
    const { fallbackModels, ...body } = params;
    if (params.stream === true) {
      // Streaming is never retried or fallback-chained (a partially consumed
      // stream cannot be transparently restarted) — matches transport policy.
      return this.streamCreate(body, opts);
    }
    return this.createWithFallback(body, fallbackModels, opts);
  }

  /**
   * Non-streaming create with the client-side model-fallback chain: try the
   * primary model; on a transient failure (default 502/503/504, after the
   * transport's own retries) re-issue against each chain model in order.
   * Terminal errors (auth, validation, billing, rate limit) never advance the
   * chain. The gateway's server-side routing (per-key `routing_policy`) runs
   * within each attempt and is reported separately via `gateway-routing` events.
   */
  private async createWithFallback(
    body: Omit<ChatCompletionParams, "fallbackModels">,
    fallbackModels: string[] | undefined,
    opts?: RequestOptions,
  ): Promise<ChatCompletionResponse> {
    const chain = (fallbackModels ?? this.http.fallback?.models ?? []).filter(
      (m) => m !== body.model,
    );
    const onStatus = new Set(this.http.fallback?.onStatus ?? DEFAULT_FALLBACK_STATUS_CODES);

    let lastError: unknown;
    // `model` may be unset (the key's default_model applies server-side) —
    // label it for fallback events; the chain always names explicit models.
    let fromModel = body.model ?? "(key default)";
    for (let index = 0; index <= chain.length; index++) {
      const model = index === 0 ? body.model : chain[index - 1]!;
      if (index > 0) {
        const err = lastError instanceof MeshAPIApiError ? lastError : undefined;
        this.http.emit({
          type: "fallback",
          fromModel,
          toModel: model!,
          chainIndex: index - 1,
          chainLength: chain.length,
          status: err?.status,
          errorCode: err?.errorCode,
          requestId: err?.requestId,
        });
      }
      try {
        return await this.http.post<ChatCompletionResponse>(
          "/v1/chat/completions",
          { ...body, model },
          opts,
        );
      } catch (err) {
        lastError = err;
        fromModel = model ?? fromModel;
        if (chain.length === 0 || !isFallbackEligible(err, onStatus)) {
          throw err;
        }
      }
    }
    throw lastError;
  }

  private streamCreate(
    params: Omit<ChatCompletionParams, "fallbackModels">,
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    return makeLazySSEIterable(this.http, "/v1/chat/completions", params, opts);
  }
}

/**
 * A failure is worth trying on another model when it is transient
 * (default 502/503/504 — a provider/gateway path problem, not this request)
 * or a pre-response network error. Aborts (user cancel / timeout signal)
 * always propagate; terminal API errors (4xx auth/validation/billing) never
 * advance the chain — they would fail identically on every model.
 */
function isFallbackEligible(err: unknown, onStatus: Set<number>): boolean {
  if (err instanceof MeshAPIApiError) {
    return onStatus.has(err.status);
  }
  return err instanceof Error && err.name !== "AbortError";
}

// ── Chat namespace ────────────────────────────────────────────────────────────

export class ChatResource {
  readonly completions: ChatCompletionsResource;

  constructor(http: HttpClient) {
    this.completions = new ChatCompletionsResource(http);
  }
}
