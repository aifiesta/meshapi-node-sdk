import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
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
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<ChatCompletionResponse>("/v1/chat/completions", params, opts);
  }

  private streamCreate(
    params: ChatCompletionParams,
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    return makeLazySSEIterable(this.http, "/v1/chat/completions", params, opts);
  }
}

// ── Chat namespace ────────────────────────────────────────────────────────────

export class ChatResource {
  readonly completions: ChatCompletionsResource;

  constructor(http: HttpClient) {
    this.completions = new ChatCompletionsResource(http);
  }
}
