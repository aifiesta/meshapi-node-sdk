import { makeLazySSEIterable } from "../http.js";
import type { HttpClient, SSEStream } from "../http.js";
import type {
  RequestOptions,
  ResponsesListParams,
  ResponsesListResponse,
  ResponsesParams,
  ResponsesResponse,
  ResponsesStreamEvent,
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
   * Returns an `AsyncIterable<ResponsesStreamEvent>`. The Responses API streams
   * lifecycle events whose `type` field starts with `"response."` — the text
   * itself arrives on `response.output_text.delta` frames as `event.delta`.
   *
   * @example
   * ```ts
   * const stream = client.responses.create({
   *   model: "openai/o4-mini",
   *   input: "Tell me a story.",
   *   stream: true,
   * });
   *
   * for await (const event of stream) {
   *   if (event.type === "response.output_text.delta") {
   *     process.stdout.write(String(event.delta ?? ""));
   *   }
   * }
   * ```
   */
  create(
    params: ResponsesParams & { stream: true },
    opts?: RequestOptions,
  ): SSEStream<ResponsesStreamEvent>;

  create(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): Promise<ResponsesResponse> | SSEStream<ResponsesStreamEvent>;

  create(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): Promise<ResponsesResponse> | SSEStream<ResponsesStreamEvent> {
    if (params.stream === true) {
      return this.streamCreate(params, opts);
    }
    return this.http.post<ResponsesResponse>("/v1/responses", params, opts);
  }

  private streamCreate(
    params: ResponsesParams,
    opts?: RequestOptions,
  ): SSEStream<ResponsesStreamEvent> {
    // `emitResponseEvents` is required here: the shared SSE parser skips frames
    // whose `type` starts with "response." so that chat callers only ever see
    // ChatCompletionChunks. The Responses API emits nothing else, so without
    // this the stream completes having yielded zero events.
    return makeLazySSEIterable<ResponsesStreamEvent>(
      this.http,
      "/v1/responses",
      params,
      opts,
      { emitResponseEvents: true },
    );
  }

  /**
   * List the caller's background response jobs (OpenAI list envelope).
   *
   * @example
   * ```ts
   * const jobs = await client.responses.list({ limit: 20 });
   * ```
   */
  list(params: ResponsesListParams = {}, opts?: RequestOptions): Promise<ResponsesListResponse> {
    const qs = new URLSearchParams();
    if (params.after !== undefined) qs.set("after", params.after);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.http.get<ResponsesListResponse>(
      `/v1/responses${query ? `?${query}` : ""}`,
      opts,
    );
  }

  /**
   * Fetch a background response job by id.
   *
   * @example
   * ```ts
   * const job = await client.responses.get("resp_abc123");
   * ```
   */
  get(responseId: string, opts?: RequestOptions): Promise<ResponsesResponse> {
    return this.http.get<ResponsesResponse>(`/v1/responses/${responseId}`, opts);
  }
}
