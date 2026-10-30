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

// ---------------------------------------------------------------------------
// Responses input token counting (POST /v1/responses/input_tokens)
// ---------------------------------------------------------------------------

/**
 * Body for `POST /v1/responses/input_tokens`.
 *
 * Takes the same shape as a `/v1/responses` request. `stream` is not
 * accepted because no inference runs.
 */
export type ResponsesInputTokensParams = Omit<ResponsesParams, "stream">;

/** Result of `POST /v1/responses/input_tokens`. */
export interface ResponsesInputTokensResponse {
  /** Object type, `"response.input_tokens"`. */
  object?: string;
  /** Number of input tokens the request would consume. */
  input_tokens: number;
  [key: string]: unknown;
}

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
   * Count the input tokens a Responses request would use, without running it.
   *
   * Auth: API key (`rsk_...`)
   *
   * No inference runs and nothing is billed. Pass the same body you would
   * send to `create`; any `stream` flag is dropped before sending.
   *
   * @example
   * ```ts
   * const { input_tokens } = await client.responses.inputTokens({
   *   model: "openai/o4-mini",
   *   input: "Explain the halting problem simply.",
   * });
   * console.log(input_tokens);
   * ```
   */
  inputTokens(
    params: ResponsesInputTokensParams,
    opts?: RequestOptions,
  ): Promise<ResponsesInputTokensResponse> {
    const { stream: _stream, ...body } = params as ResponsesParams;
    void _stream;
    return this.http.post<ResponsesInputTokensResponse>(
      "/v1/responses/input_tokens",
      body,
      opts,
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
