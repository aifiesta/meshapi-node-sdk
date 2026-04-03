import { parseSSEStream } from "../http.js";
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
    // Return an AsyncIterable that lazily initiates the streaming fetch.
    // This ensures the request is only sent when the caller starts iterating.
    const http = this.http;

    return {
      [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
        let iterator: AsyncIterator<ChatCompletionChunk> | null = null;

        const init = async (): Promise<AsyncIterator<ChatCompletionChunk>> => {
          const response = await http.stream("/v1/chat/completions", params, opts);
          const gen = parseSSEStream(response);
          return gen[Symbol.asyncIterator]();
        };

        return {
          async next(): Promise<IteratorResult<ChatCompletionChunk>> {
            if (!iterator) {
              iterator = await init();
            }
            return iterator.next();
          },
          async return(
            value?: unknown,
          ): Promise<IteratorResult<ChatCompletionChunk>> {
            if (iterator?.return) {
              return iterator.return(value);
            }
            return { done: true, value: undefined as unknown as ChatCompletionChunk };
          },
          async throw(err?: unknown): Promise<IteratorResult<ChatCompletionChunk>> {
            if (iterator?.throw) {
              return iterator.throw(err);
            }
            throw err;
          },
        };
      },
    };
  }
}

// ── Chat namespace ────────────────────────────────────────────────────────────

export class ChatResource {
  readonly completions: ChatCompletionsResource;

  constructor(http: HttpClient) {
    this.completions = new ChatCompletionsResource(http);
  }
}
