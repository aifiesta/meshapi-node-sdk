import { makeLazySSEIterable } from "../http.js";
import type { HttpClient } from "../http.js";
import type {
  ChatCompletionChunk,
  RequestOptions,
  ResponsesParams,
  ResponsesResponse,
} from "../types.js";

export class ResponsesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a response (non-streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const response = await client.responses.create({
   *   model: "openai/o4-mini",
   *   input: "Explain the halting problem simply.",
   *   reasoning: { effort: "medium" },
   * });
   * console.log(response.choices[0]?.message.content);
   * ```
   */
  create(
    params: ResponsesParams & { stream?: false },
    opts?: RequestOptions,
  ): Promise<ResponsesResponse>;

  /**
   * Create a response (streaming).
   *
   * Auth: API key (`rsk_...`)
   *
   * Returns an `AsyncIterable<ChatCompletionChunk>` that yields only
   * chat-completion-chunk shaped events (`object: "chat.completion.chunk"`).
   * Responses API lifecycle and reasoning events whose `type` field starts
   * with `"response."` (e.g. `"response.reasoning_text.delta"`,
   * `"response.reasoning_summary_text.delta"`) are silently dropped by the
   * SSE parser — they are not exposed as a distinct type in this SDK yet.
   *
   * @example
   * ```ts
   * const stream = client.responses.create({
   *   model: "openai/o4-mini",
   *   input: [{ role: "user", content: "Tell me a story." }],
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
    params: ResponsesParams & { stream: true },
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk>;

  create(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): Promise<ResponsesResponse> | AsyncIterable<ChatCompletionChunk>;

  create(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): Promise<ResponsesResponse> | AsyncIterable<ChatCompletionChunk> {
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<ResponsesResponse>("/v1/responses", params, opts);
  }

  private streamCreate(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    return makeLazySSEIterable(this.http, "/v1/responses", params, opts);
  }
}
